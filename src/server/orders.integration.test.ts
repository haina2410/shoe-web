import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import { testPrisma, resetDb } from "@/test/db";
import { createOrderCore } from "@/server/orders";
import { OrderStatus } from "@/generated/prisma/enums";
import type { CreateOrderInput } from "@/lib/validation/checkout";
import { createTestBoss, resetQueues } from "@/test/boss";
import {
  QUEUE_SEND_ORDER_CONFIRMATION,
  QUEUE_SEND_ZALO_ORDER_CREATED,
  ensureQueues,
  enqueueOrderConfirmation,
  enqueueZaloOrderCreatedNotifications,
} from "@/jobs/queue";

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

/**
 * Deps giả cho các test KHÔNG nhắm vào hành vi enqueue (F1, final review Ngày
 * 6): TRƯỚC ĐÂY các call site này gọi `createOrderCore` với deps MẶC ĐỊNH —
 * tức `enqueueOrderConfirmation` thật → `getBoss()` → `DATABASE_URL` (database
 * PHÁT TRIỂN, không phải `testPrisma` trỏ `DATABASE_URL_TEST`) — để lại schema
 * `pgboss` + job rác trong `leafshoes_development` (xác nhận thực nghiệm, xem
 * báo cáo). Một fake mới mỗi lần gọi để không rò rỉ call-count giữa các test.
 */
function noEnqueueDeps() {
  return {
    enqueueOrderConfirmation: vi.fn().mockResolvedValue(undefined),
    enqueueZaloOrderCreatedNotifications: vi.fn().mockResolvedValue(undefined),
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
      noEnqueueDeps(),
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
      noEnqueueDeps(),
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
        noEnqueueDeps(),
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
        noEnqueueDeps(),
      ),
    ).rejects.toThrow();

    expect(await testPrisma.order.count()).toBe(0);
  });

  it("2 đơn liên tiếp → orderCode khác nhau, đều khớp định dạng LEAFXXXXXX", async () => {
    await makeShippingZone();
    const category = await makeCategory();
    const { variant } = await makeProductWithVariant({
      categoryId: category.id,
      stock: 10,
    });

    const order1 = await createOrderCore(
      testPrisma,
      baseInput({ items: [{ variantId: variant.id, quantity: 1 }] }),
      noEnqueueDeps(),
    );
    const order2 = await createOrderCore(
      testPrisma,
      baseInput({ items: [{ variantId: variant.id, quantity: 1 }] }),
      noEnqueueDeps(),
    );

    expect(order1.orderCode).toMatch(/^LEAF[A-Z0-9]{6}$/);
    expect(order2.orderCode).toMatch(/^LEAF[A-Z0-9]{6}$/);
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
      noEnqueueDeps(),
    );

    const persisted = await testPrisma.variant.findUnique({ where: { id: variant.id } });
    expect(persisted?.stock).toBe(10);
  });

  it("đặt hàng thành công → enqueue email và Zalo cùng nhận orderCode của đơn vừa tạo", async () => {
    await makeShippingZone();
    const category = await makeCategory();
    const { variant } = await makeProductWithVariant({ categoryId: category.id, stock: 10 });
    const enqueueEmail = vi.fn().mockResolvedValue(undefined);
    const enqueueZalo = vi.fn().mockResolvedValue(undefined);

    const order = await createOrderCore(
      testPrisma,
      baseInput({ items: [{ variantId: variant.id, quantity: 1 }] }),
      {
        enqueueOrderConfirmation: enqueueEmail,
        enqueueZaloOrderCreatedNotifications: enqueueZalo,
      },
    );

    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.anything(),
      { orderCode: order.orderCode },
    );
    expect(enqueueZalo).toHaveBeenCalledWith(
      expect.anything(),
      { orderCode: order.orderCode },
    );
  });

  it("hết hàng → deps.enqueueOrderConfirmation KHÔNG được gọi, và không có job mồ côi (0 order)", async () => {
    await makeShippingZone();
    const category = await makeCategory();
    const { variant } = await makeProductWithVariant({ categoryId: category.id, stock: 1 });
    const enqueueEmail = vi.fn().mockResolvedValue(undefined);
    const enqueueZalo = vi.fn().mockResolvedValue(undefined);

    await expect(
      createOrderCore(
        testPrisma,
        baseInput({ items: [{ variantId: variant.id, quantity: 5 }] }),
        {
          enqueueOrderConfirmation: enqueueEmail,
          enqueueZaloOrderCreatedNotifications: enqueueZalo,
        },
      ),
    ).rejects.toThrow();

    expect(enqueueEmail).not.toHaveBeenCalled();
    expect(enqueueZalo).not.toHaveBeenCalled();
    expect(await testPrisma.order.count()).toBe(0);
  });

  it("deps.enqueueOrderConfirmation throw → createOrderCore throw VÀ DB có 0 order (đơn + job nguyên tử)", async () => {
    await makeShippingZone();
    const category = await makeCategory();
    const { variant } = await makeProductWithVariant({ categoryId: category.id, stock: 10 });
    const enqueueEmail = vi.fn().mockRejectedValue(new Error("Lỗi hạ tầng hàng đợi giả lập"));

    await expect(
      createOrderCore(
        testPrisma,
        baseInput({ items: [{ variantId: variant.id, quantity: 1 }] }),
        {
          enqueueOrderConfirmation: enqueueEmail,
          enqueueZaloOrderCreatedNotifications: vi.fn().mockResolvedValue(undefined),
        },
      ),
    ).rejects.toThrow("Lỗi hạ tầng hàng đợi giả lập");

    expect(await testPrisma.order.count()).toBe(0);
    expect(await testPrisma.orderItem.count()).toBe(0);
  });

  it("Zalo enqueue thất bại → createOrderCore rollback đơn hàng", async () => {
    await makeShippingZone();
    const category = await makeCategory();
    const { variant } = await makeProductWithVariant({ categoryId: category.id, stock: 10 });

    await expect(
      createOrderCore(
        testPrisma,
        baseInput({ items: [{ variantId: variant.id, quantity: 1 }] }),
        {
          enqueueOrderConfirmation: vi.fn().mockResolvedValue(undefined),
          enqueueZaloOrderCreatedNotifications: vi
            .fn()
            .mockRejectedValue(new Error("Zalo queue unavailable")),
        },
      ),
    ).rejects.toThrow("Zalo queue unavailable");

    expect(await testPrisma.order.count()).toBe(0);
    expect(await testPrisma.orderItem.count()).toBe(0);
  });

  describe("nguyên tử thật với pg-boss thật (không fake)", () => {
    let boss: PgBoss;

    beforeAll(async () => {
      boss = createTestBoss();
      await boss.start();
      await ensureQueues(boss);
    });

    afterAll(async () => {
      await boss.stop();
    });

    beforeEach(async () => {
      await resetQueues(boss);
    });

    it("order tạo qua createOrderCore (deps dùng boss test thật) → job tồn tại trong queue với orderCode đúng", async () => {
      await makeShippingZone();
      const category = await makeCategory();
      const { variant } = await makeProductWithVariant({ categoryId: category.id, stock: 10 });

      const order = await createOrderCore(
        testPrisma,
        baseInput({ items: [{ variantId: variant.id, quantity: 1 }] }),
        {
          enqueueOrderConfirmation: (tx, payload) => enqueueOrderConfirmation(tx, payload, boss),
          enqueueZaloOrderCreatedNotifications: (tx, payload) =>
            enqueueZaloOrderCreatedNotifications(tx, payload, boss, [
              { key: "staff-hanoi", chatId: "1000001" },
              { key: "staff-saigon", chatId: "1000002" },
            ]),
        },
      );

      const jobs = await boss.findJobs<{ orderCode: string }>(QUEUE_SEND_ORDER_CONFIRMATION, {
        data: { orderCode: order.orderCode },
      });
      expect(jobs).toHaveLength(1);
    expect(jobs[0].data).toEqual({ orderCode: order.orderCode });

      const zaloJobs = await boss.findJobs<{
        orderCode: string;
        recipientKey: string;
      }>(QUEUE_SEND_ZALO_ORDER_CREATED, { data: { orderCode: order.orderCode } });
      expect(zaloJobs).toHaveLength(2);
      expect(zaloJobs.map((job) => job.data)).toEqual(expect.arrayContaining([
        { orderCode: order.orderCode, recipientKey: "staff-hanoi" },
        { orderCode: order.orderCode, recipientKey: "staff-saigon" },
      ]));
    });
  });
});
