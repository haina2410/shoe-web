import "dotenv/config";
import { describe, it, expect, afterEach, vi } from "vitest";
import { PgBoss } from "pg-boss";
import {
  QUEUE_SEND_ORDER_CONFIRMATION,
  orderConfirmationJobSchema,
  getBoss,
} from "@/jobs/queue";

/**
 * `getBoss()` cache promise trên `globalThis.bossPromise` (xem `queue.ts`).
 * Không có API export nào để reset cache — test dưới đọc/ghi thẳng
 * `globalThis` (cùng "cửa" mà bản thân `getBoss()` dùng, KHÔNG phải API mới)
 * để đảm bảo mỗi test bắt đầu sạch, không rò rỉ instance/promise giữa các
 * test case.
 */
const globalForBoss = globalThis as unknown as { bossPromise?: Promise<PgBoss> };

describe("orderConfirmationJobSchema", () => {
  it("chấp nhận payload chỉ có orderCode (KHÔNG có PII)", () => {
    expect(
      orderConfirmationJobSchema.parse({ orderCode: "LEAF-ABC123" }),
    ).toEqual({ orderCode: "LEAF-ABC123" });
  });

  it("loại payload thiếu orderCode", () => {
    expect(() => orderConfirmationJobSchema.parse({})).toThrow();
  });

  it("loại orderCode rỗng", () => {
    expect(() =>
      orderConfirmationJobSchema.parse({ orderCode: "" }),
    ).toThrow();
  });

  it("loại field lạ chứa PII (email, phone) khỏi payload — kết quả CHỈ còn đúng orderCode", () => {
    const parsed = orderConfirmationJobSchema.parse({
      orderCode: "LEAF-XXXXXX",
      email: "khach@example.com",
      phone: "0900000000",
    });

    expect(parsed).toEqual({ orderCode: "LEAF-XXXXXX" });
    expect(Object.keys(parsed)).toEqual(["orderCode"]);
  });

  it("tên queue đúng như đặc tả", () => {
    expect(QUEUE_SEND_ORDER_CONFIRMATION).toBe("send-order-confirmation");
  });
});

describe("getBoss()", () => {
  afterEach(async () => {
    // Dọn cache + boss thật (nếu có) sau mỗi test để không rò rỉ sang test
    // kế tiếp (đây chính là `globalThis.bossPromise` mà `getBoss()` tự đọc/
    // ghi — không phải API mới, chỉ dùng lại "cửa" sẵn có).
    const cached = globalForBoss.bossPromise;
    globalForBoss.bossPromise = undefined;
    if (cached) {
      await cached.then((boss) => boss.stop()).catch(() => {});
    }
  });

  it("lần khởi tạo đầu thất bại (DB không kết nối được) KHÔNG bị cache mãi mãi — lần gọi sau retry và thành công", async () => {
    const originalUrl = process.env.DATABASE_URL;
    const testUrl = process.env.DATABASE_URL_TEST;
    if (!testUrl) throw new Error("DATABASE_URL_TEST chưa được cấu hình");

    try {
      // Trỏ vào một địa chỉ chắc chắn không kết nối được để `boss.start()`
      // reject (không có gì lắng nghe ở cổng 1).
      process.env.DATABASE_URL =
        "postgresql://invalid:invalid@127.0.0.1:1/leafshoes_unreachable";

      await expect(getBoss()).rejects.toThrow();

      // DB "hồi phục" — lần gọi kế tiếp phải retry (tạo promise mới) thay vì
      // trả lại promise reject đã cache từ lần trước.
      process.env.DATABASE_URL = testUrl;

      const boss = await getBoss();
      expect(boss).toBeDefined();
    } finally {
      process.env.DATABASE_URL = originalUrl;
    }
  });

  it("start() thành công nhưng ensureQueues() (createQueue) thất bại → instance đã start() đó phải được stop(), không rò rỉ", async () => {
    // Giả lập đúng hình dạng lỗi finding nêu: `boss.start()` thành công (DB
    // kết nối được bình thường), nhưng bước SAU đó (`ensureQueues` gọi
    // `boss.createQueue`) thất bại. Không có cách nào ép `createQueue` thất
    // bại từ bên ngoài mà không đụng DB thật, nên spy thẳng vào
    // `PgBoss.prototype.createQueue` (class do thư viện `pg-boss` sở hữu,
    // không phải seam tự thêm vào module của mình) để reject đúng 1 lần —
    // `start()` (không đụng `createQueue`, xem `node_modules/pg-boss/dist/
    // index.js`) vẫn chạy thật, không bị mock.
    let startedInstance: PgBoss | undefined;
    const createQueueSpy = vi
      .spyOn(PgBoss.prototype, "createQueue")
      .mockImplementationOnce(function (this: PgBoss) {
        startedInstance = this;
        return Promise.reject(new Error("createQueue thất bại (giả lập test)"));
      });
    const stopSpy = vi.spyOn(PgBoss.prototype, "stop");

    try {
      await expect(getBoss()).rejects.toThrow("createQueue thất bại (giả lập test)");

      expect(startedInstance).toBeDefined();
      // `stop()` phải được gọi TRÊN ĐÚNG instance đã `start()` thành công đó
      // — không phải một instance nào khác — để không rò rỉ pool đang mở.
      expect(stopSpy.mock.instances).toContain(startedInstance);
    } finally {
      createQueueSpy.mockRestore();
      stopSpy.mockRestore();
    }
  });
});
