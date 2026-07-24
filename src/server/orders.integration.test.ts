import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, resetDb } from "@/test/db";
import { createOrderCore } from "@/server/orders";
import { OrderStatus } from "@/generated/prisma/enums";
import type { CreateOrderInput } from "@/lib/validation/checkout";

/**
 * `src/server/orders.integration.test.ts` — integration test cho
 * `createOrderCore` (`src/server/orders.ts`), test bằng `testPrisma`
 * (Postgres thật, xem `src/test/db.ts`).
 *
 * `resetDb()` TRUNCATE cả `province_zone`/`shipping_zone` nên MỌI test ở đây
 * tự tạo fixture đầy đủ: category → product → variants, VÀ 1 shipping zone +
 * provinceZone để `getShippingFee` phân giải được (nếu không sẽ throw lỗi
 * cấu hình, không phải lỗi nghiệp vụ đang test).
 */

const ZONE_FEE = 30000;
const TEST_PROVINCE = "Hà Nội";

async function makeShippingZone(fee = ZONE_FEE, province = TEST_PROVINCE) {
  const zone = await testPrisma.shippingZone.create({
    data: { name: `Zone ${province}-${Math.random().toString(36).slice(2, 8)}`, fee, isDefault: false },
  });
  await testPrisma.provinceZone.create({
    data: { province, zoneId: zone.id },
  });
  return zone;
}

async function makeCategory(name = "Giày Sneaker", slug = "giay-sneaker") {
  return testPrisma.category.create({ data: { name, slug } });
}

async function makeProductWithVariant(opts: {
  categoryId: string;
  basePrice?: number;
  priceOverride?: number | null;
  stock?: number;
  size?: string;
  color?: string;
  sku?: string;
  name?: string;
}) {
  const product = await testPrisma.product.create({
    data: {
      name: opts.name ?? "Giày Chạy Bộ Alpha",
      nameNormalized: "giay chay bo alpha",
      categoryId: opts.categoryId,
      basePrice: opts.basePrice ?? 300000,
      status: "ACTIVE",
      slug: "giay-" + Math.random().toString(36).slice(2, 10),
      variants: {
        create: [
          {
            size: opts.size ?? "40",
            color: opts.color ?? "Đen",
            sku: opts.sku ?? "SKU-" + Math.random().toString(36).slice(2, 10),
            priceOverride: opts.priceOverride ?? null,
            stock: opts.stock ?? 10,
          },
        ],
      },
    },
    include: { variants: true },
  });
  return { product, variant: product.variants[0] };
}

function baseInput(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    customerName: "Nguyễn Văn A",
    email: "khach@example.com",
    phone: "0901234567",
    province: TEST_PROVINCE,
    ward: "Phường Ba Đình",
    addressLine: "123 Đường Láng",
    items: [],
    ...overrides,
  };
}

describe("createOrderCore", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("happy path: subtotal/shippingFee/total đúng, status PENDING_PAYMENT, OrderItem snapshot đúng", async () => {
    await makeShippingZone();
    const category = await makeCategory();
    const { variant } = await makeProductWithVariant({
      categoryId: category.id,
      basePrice: 300000,
      priceOverride: null,
      stock: 10,
    });

    const order = await createOrderCore(
      testPrisma,
      baseInput({ items: [{ variantId: variant.id, quantity: 2 }] }),
    );

    expect(order.subtotal).toBe(600000);
    expect(order.shippingFee).toBe(ZONE_FEE);
    expect(order.total).toBe(600000 + ZONE_FEE);
    expect(order.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      variantId: variant.id,
      productName: "Giày Chạy Bộ Alpha",
      size: "40",
      color: "Đen",
      unitPrice: 300000,
      quantity: 2,
    });
  });

  it("priceOverride được ưu tiên hơn basePrice khi tính unitPrice", async () => {
    await makeShippingZone();
    const category = await makeCategory();
    const { variant } = await makeProductWithVariant({
      categoryId: category.id,
      basePrice: 300000,
      priceOverride: 250000,
      stock: 10,
    });

    const order = await createOrderCore(
      testPrisma,
      baseInput({ items: [{ variantId: variant.id, quantity: 1 }] }),
    );

    expect(order.items[0].unitPrice).toBe(250000);
    expect(order.subtotal).toBe(250000);
  });

  it("tồn kho không đủ → throw VÀ không tạo order nào (rollback)", async () => {
    await makeShippingZone();
    const category = await makeCategory();
    const { variant } = await makeProductWithVariant({
      categoryId: category.id,
      stock: 1,
    });

    await expect(
      createOrderCore(
        testPrisma,
        baseInput({ items: [{ variantId: variant.id, quantity: 5 }] }),
      ),
    ).rejects.toThrow();

    expect(await testPrisma.order.count()).toBe(0);
    expect(await testPrisma.orderItem.count()).toBe(0);
  });

  it("variantId lạ (không tồn tại) → throw", async () => {
    await makeShippingZone();

    await expect(
      createOrderCore(
        testPrisma,
        baseInput({ items: [{ variantId: "khong-ton-tai", quantity: 1 }] }),
      ),
    ).rejects.toThrow();

    expect(await testPrisma.order.count()).toBe(0);
  });

  it("2 đơn liên tiếp → orderCode khác nhau, đều khớp định dạng LEAF-XXXXXX", async () => {
    await makeShippingZone();
    const category = await makeCategory();
    const { variant } = await makeProductWithVariant({
      categoryId: category.id,
      stock: 10,
    });

    const order1 = await createOrderCore(
      testPrisma,
      baseInput({ items: [{ variantId: variant.id, quantity: 1 }] }),
    );
    const order2 = await createOrderCore(
      testPrisma,
      baseInput({ items: [{ variantId: variant.id, quantity: 1 }] }),
    );

    expect(order1.orderCode).toMatch(/^LEAF-[A-Z0-9]{6}$/);
    expect(order2.orderCode).toMatch(/^LEAF-[A-Z0-9]{6}$/);
    expect(order1.orderCode).not.toBe(order2.orderCode);
  });

  it("tạo order KHÔNG làm thay đổi variant.stock", async () => {
    await makeShippingZone();
    const category = await makeCategory();
    const { variant } = await makeProductWithVariant({
      categoryId: category.id,
      stock: 10,
    });

    await createOrderCore(
      testPrisma,
      baseInput({ items: [{ variantId: variant.id, quantity: 3 }] }),
    );

    const persisted = await testPrisma.variant.findUnique({ where: { id: variant.id } });
    expect(persisted?.stock).toBe(10);
  });
});
