import type { PrismaClient, Prisma, Order, OrderItem } from "@/generated/prisma/client";
import { OrderStatus } from "@/generated/prisma/enums";
import { cartSubtotal, orderTotal } from "@/lib/cart-math";
import { generateOrderCode } from "@/lib/order-code";
import { getShippingFee } from "@/lib/shipping";
import type { CreateOrderInput } from "@/lib/validation/checkout";
import { enqueueOrderConfirmation } from "@/jobs/queue";

/**
 * `src/server/orders.ts` — hàm core THUẦN cho nghiệp vụ đặt hàng (checkout).
 *
 * Cố ý KHÔNG import bất kỳ gì từ `next/*` và KHÔNG tự gọi auth: hàm ở đây
 * nhận `db: PrismaClient` + input ĐÃ được validate (zod) từ nơi gọi. Nhờ vậy
 * có thể integration-test trực tiếp bằng `testPrisma`, không cần dựng
 * HTTP/Server Action. Việc validate input là trách nhiệm của lớp mỏng
 * `src/server/actions/checkout.ts`.
 */

export type OrderWithItems = Order & { items: OrderItem[] };

/**
 * Lỗi NGHIỆP VỤ (thông báo tiếng Việt an toàn để hiển thị thẳng cho khách):
 * biến thể không tồn tại, hết hàng, v.v. Phân biệt với lỗi hạ tầng (DB mất
 * kết nối, pg-boss lỗi enqueue...) để lớp gọi (`src/server/actions/checkout.ts`)
 * biết lỗi nào được phép trả nguyên văn ra client, lỗi nào phải che bằng
 * thông báo chung (không rò rỉ chi tiết nội bộ).
 */
export class OrderBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderBusinessError";
  }
}

/**
 * Dependencies tiêm được của `createOrderCore` — hiện chỉ có việc enqueue job
 * gửi email xác nhận đơn. Giá trị mặc định dùng `enqueueOrderConfirmation`
 * thật (`src/jobs/queue.ts`) nên mọi caller hiện có (Server Action, test cũ)
 * không cần đổi gì; test core tiêm fake để cô lập khỏi pg-boss thật.
 */
export type CreateOrderDeps = {
  enqueueOrderConfirmation: (
    tx: Prisma.TransactionClient,
    payload: { orderCode: string },
  ) => Promise<void>;
};

/** Số lần thử tối đa để sinh `orderCode` không đụng hàng đã tồn tại. */
const MAX_ORDER_CODE_ATTEMPTS = 5;

/**
 * Tạo `orderCode` chưa tồn tại trong DB, thử tối đa `MAX_ORDER_CODE_ATTEMPTS`
 * lần. Đây chỉ là biện pháp giảm khả năng đụng độ (best-effort) — ràng buộc
 * `@unique` trên cột `orderCode` ở schema mới là backstop thật sự (nếu vẫn
 * đụng độ ở bước `create`, Prisma sẽ ném lỗi và transaction rollback).
 */
async function generateUniqueOrderCode(
  tx: Prisma.TransactionClient,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ORDER_CODE_ATTEMPTS; attempt += 1) {
    const candidate = generateOrderCode();
    const existing = await tx.order.findUnique({ where: { orderCode: candidate } });
    if (!existing) {
      return candidate;
    }
  }
  throw new Error(
    `Không sinh được mã đơn hàng duy nhất sau ${MAX_ORDER_CODE_ATTEMPTS} lần thử.`,
  );
}

/**
 * Tạo đơn hàng (guest checkout) trong 1 `db.$transaction`:
 * 1. Với mỗi item trong giỏ: tra `variant` (kèm `product`) — biến thể không
 *    tồn tại hoặc không đủ tồn kho đều ném lỗi (tiếng Việt, nêu rõ sản phẩm/
 *    size/màu) → transaction rollback, không tạo order rác.
 * 2. `unitPrice` ưu tiên `priceOverride`, snapshot lại `productName`/`size`/
 *    `color` tại thời điểm đặt hàng (không phụ thuộc dữ liệu product/variant
 *    thay đổi sau này).
 * 3. Tính `subtotal`/`shippingFee`/`total`, sinh `orderCode` duy nhất, rồi
 *    tạo `Order` kèm `OrderItem` snapshot trong 1 lần `create` lồng nhau.
 * 4. Ngay sau khi `order.create` thành công (vẫn TRONG transaction),
 *    `deps.enqueueOrderConfirmation(tx, { orderCode })` ghi job gửi email xác
 *    nhận — job đi qua CÙNG `tx` nên nếu bước này throw, transaction rollback
 *    theo: không có đơn, không có job mồ côi.
 *
 * CỐ Ý VẪN CHƯA giảm `variant.stock` — việc đó thuộc Ngày 7 (xác nhận thanh
 * toán qua webhook SePay).
 */
export async function createOrderCore(
  db: PrismaClient,
  input: CreateOrderInput,
  deps: CreateOrderDeps = { enqueueOrderConfirmation },
): Promise<OrderWithItems> {
  return db.$transaction(async (tx) => {
    const lines: {
      variantId: string;
      productName: string;
      size: string;
      color: string;
      unitPrice: number;
      quantity: number;
    }[] = [];

    for (const item of input.items) {
      const variant = await tx.variant.findUnique({
        where: { id: item.variantId },
        include: { product: true },
      });
      if (!variant) {
        throw new OrderBusinessError(
          `Không tìm thấy biến thể sản phẩm (variantId: ${item.variantId}).`,
        );
      }
      if (variant.stock < item.quantity) {
        throw new OrderBusinessError(
          `Sản phẩm "${variant.product.name}" (size ${variant.size}, màu ${variant.color}) ` +
            `chỉ còn ${variant.stock} trong kho, không đủ số lượng đặt (${item.quantity}).`,
        );
      }

      const unitPrice = variant.priceOverride ?? variant.product.basePrice;
      lines.push({
        variantId: variant.id,
        productName: variant.product.name,
        size: variant.size,
        color: variant.color,
        unitPrice,
        quantity: item.quantity,
      });
    }

    const subtotal = cartSubtotal(lines);
    const shippingFee = await getShippingFee(tx, input.province);
    const total = orderTotal(subtotal, shippingFee);

    const orderCode = await generateUniqueOrderCode(tx);

    const order = await tx.order.create({
      data: {
        orderCode,
        email: input.email,
        customerName: input.customerName,
        phone: input.phone,
        province: input.province,
        ward: input.ward,
        addressLine: input.addressLine,
        note: input.note,
        subtotal,
        shippingFee,
        total,
        status: OrderStatus.PENDING_PAYMENT,
        items: {
          create: lines.map((line) => ({
            variantId: line.variantId,
            productName: line.productName,
            size: line.size,
            color: line.color,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
          })),
        },
      },
      include: { items: true },
    });

    // Ghi job gửi email xác nhận TRONG cùng `tx` — enqueue throw ⇒ transaction
    // rollback ⇒ không có đơn, không có job (xem docstring hàm ở trên).
    await deps.enqueueOrderConfirmation(tx, { orderCode: order.orderCode });

    return order;
  });
}
