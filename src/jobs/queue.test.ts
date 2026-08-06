import "dotenv/config";
import { describe, it, expect, afterEach, vi } from "vitest";
import { PgBoss } from "pg-boss";
import {
  QUEUE_EXPIRE_UNPAID,
  QUEUE_SEND_ORDER_CONFIRMATION,
  QUEUE_SEND_PAYMENT_CONFIRMED,
  QUEUE_SEND_ZALO_ORDER_CREATED,
  orderConfirmationJobSchema,
  paymentConfirmedJobSchema,
  zaloOrderCreatedJobSchema,
  getBoss,
  createBoss,
  ensureQueues,
  ensureSchedules,
  enqueueOrderConfirmation,
  enqueuePaymentConfirmed,
  enqueueZaloOrderCreatedNotifications,
} from "@/jobs/queue";

/**
 * `getBoss()` cache promise trên `globalThis.bossPromise` (xem `queue.ts`).
 * Không có API export nào để reset cache — test dưới đọc/ghi thẳng
 * `globalThis` (cùng "cửa" mà bản thân `getBoss()` dùng, KHÔNG phải API mới)
 * để đảm bảo mỗi test bắt đầu sạch, không rò rỉ instance/promise giữa các
 * test case.
 */
const globalForBoss = globalThis as unknown as { bossPromise?: Promise<PgBoss> };

describe("expire-unpaid queue schedule", () => {
  it("đăng ký đúng queue, cron, UTC và stable key theo signature pg-boss 12.26", async () => {
    const schedule = vi.fn().mockResolvedValue(undefined);
    const boss = { schedule } as unknown as PgBoss;

    await ensureSchedules(boss);

    expect(QUEUE_EXPIRE_UNPAID).toBe("expire-unpaid");
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(
      QUEUE_EXPIRE_UNPAID,
      "*/15 * * * *",
      {},
      { tz: "UTC", key: "expire-unpaid-15m" },
    );
  });
});

describe("orderConfirmationJobSchema", () => {
  it("chấp nhận payload chỉ có orderCode (KHÔNG có PII)", () => {
    expect(
      orderConfirmationJobSchema.parse({ orderCode: "LEAFABC123" }),
    ).toEqual({ orderCode: "LEAFABC123" });
  });

  it("loại payload thiếu orderCode", () => {
    expect(() => orderConfirmationJobSchema.parse({})).toThrow();
  });

  it("loại orderCode rỗng", () => {
    expect(() =>
      orderConfirmationJobSchema.parse({ orderCode: "" }),
    ).toThrow();
  });

  it.each(["LEAFABC12", "LEAFABC1234", "OTHERABC123", "leafabc123"])(
    "loại orderCode không đúng định dạng canonical LEAF + 6 ký tự: %s",
    (orderCode) => {
      expect(() => orderConfirmationJobSchema.parse({ orderCode })).toThrow();
    },
  );

  it("loại field lạ chứa PII (email, phone) khỏi payload — kết quả CHỈ còn đúng orderCode", () => {
    const parsed = orderConfirmationJobSchema.parse({
      orderCode: "LEAFXXXXXX",
      email: "khach@example.com",
      phone: "0900000000",
    });

    expect(parsed).toEqual({ orderCode: "LEAFXXXXXX" });
    expect(Object.keys(parsed)).toEqual(["orderCode"]);
  });

  it("tên queue đúng như đặc tả", () => {
    expect(QUEUE_SEND_ORDER_CONFIRMATION).toBe("send-order-confirmation");
  });
});

describe("paymentConfirmedJobSchema", () => {
  it("chỉ giữ orderCode, không lưu PII vào payload job", () => {
    expect(
      paymentConfirmedJobSchema.parse({
        orderCode: "LEAFABC123",
        email: "must-not-persist@example.com",
      }),
    ).toEqual({ orderCode: "LEAFABC123" });
  });

  it("loại orderCode rỗng", () => {
    expect(() => paymentConfirmedJobSchema.parse({ orderCode: "" })).toThrow();
  });

  it.each(["LEAFABC12", "LEAFABC1234", "OTHERABC123", "leafabc123"])(
    "loại orderCode không đúng định dạng canonical LEAF + 6 ký tự: %s",
    (orderCode) => {
      expect(() => paymentConfirmedJobSchema.parse({ orderCode })).toThrow();
    },
  );

  it("dùng đúng tên queue thanh toán", () => {
    expect(QUEUE_SEND_PAYMENT_CONFIRMED).toBe("send-payment-confirmed");
  });
});

describe("Zalo order-created queue", () => {
  it("creates and updates the send-zalo-order-created queue", async () => {
    const createQueue = vi.fn().mockResolvedValue(undefined);
    const updateQueue = vi.fn().mockResolvedValue(undefined);
    const boss = { createQueue, updateQueue } as unknown as PgBoss;

    await ensureQueues(boss);

    expect(QUEUE_SEND_ZALO_ORDER_CREATED).toBe("send-zalo-order-created");
    expect(createQueue).toHaveBeenCalledWith(
      QUEUE_SEND_ZALO_ORDER_CREATED,
      expect.objectContaining({ retryLimit: 5, retryDelay: 60, retryBackoff: true }),
    );
    expect(updateQueue).toHaveBeenCalledWith(
      QUEUE_SEND_ZALO_ORDER_CREATED,
      expect.objectContaining({ retryLimit: 5, retryDelay: 60, retryBackoff: true }),
    );
  });

  it("accepts only canonical orderCode and a non-empty recipient key", () => {
    expect(
      zaloOrderCreatedJobSchema.parse({
        orderCode: "LEAFABC123",
        recipientKey: "staff-hanoi",
        chatId: "must-not-persist",
      }),
    ).toEqual({ orderCode: "LEAFABC123", recipientKey: "staff-hanoi" });

    expect(() =>
      zaloOrderCreatedJobSchema.parse({ orderCode: "LEAFABC123", recipientKey: "" }),
    ).toThrow();
  });

  it("enqueues one PII-free job per configured recipient", async () => {
    const send = vi.fn().mockResolvedValue("job-id");
    const boss = { send } as unknown as PgBoss;
    const tx = { $queryRawUnsafe: vi.fn() };

    await enqueueZaloOrderCreatedNotifications(
      tx,
      { orderCode: "LEAFABC123" },
      boss,
      [
        { key: "staff-hanoi", chatId: "1000001" },
        { key: "staff-saigon", chatId: "1000002" },
      ],
    );

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(
      1,
      QUEUE_SEND_ZALO_ORDER_CREATED,
      { orderCode: "LEAFABC123", recipientKey: "staff-hanoi" },
      expect.objectContaining({ db: expect.anything() }),
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      QUEUE_SEND_ZALO_ORDER_CREATED,
      { orderCode: "LEAFABC123", recipientKey: "staff-saigon" },
      expect.objectContaining({ db: expect.anything() }),
    );
  });

  it("does not enqueue jobs when no recipients are configured", async () => {
    const send = vi.fn();
    const boss = { send } as unknown as PgBoss;
    const tx = { $queryRawUnsafe: vi.fn() };

    await enqueueZaloOrderCreatedNotifications(tx, { orderCode: "LEAFABC123" }, boss, []);

    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a null pg-boss job id so the transaction rolls back", async () => {
    const boss = { send: vi.fn().mockResolvedValue(null) } as unknown as PgBoss;
    const tx = { $queryRawUnsafe: vi.fn() };

    await expect(
      enqueueZaloOrderCreatedNotifications(
        tx,
        { orderCode: "LEAFABC123" },
        boss,
        [{ key: "staff-hanoi", chatId: "1000001" }],
      ),
    ).rejects.toThrow(/LEAFABC123/);
  });
});

describe("createBoss() — chặn DATABASE_URL mặc định trong test (F1)", () => {
  it("NODE_ENV=test (mặc định của vitest) + không truyền connectionString → throw ngay, không mở kết nối nào", () => {
    // NODE_ENV đã LÀ "test" trong tiến trình vitest (mặc định, xem
    // `src/__tmp_nodeenv.test.ts` đã dùng để xác nhận thực nghiệm trong báo
    // cáo) — không cần stub gì thêm, đây chính là kịch bản thật mà finding F1
    // mô tả: `getBoss()`/`enqueueOrderConfirmation` mặc định gọi
    // `createBoss()` KHÔNG tham số.
    expect(process.env.NODE_ENV).toBe("test");
    expect(() => createBoss()).toThrow(/NODE_ENV=test/);
  });

  it("truyền connectionString tường minh → KHÔNG bị chặn dù NODE_ENV=test (test thật vẫn tạo boss được, chỉ không dùng DATABASE_URL mặc định)", () => {
    const testUrl = process.env.DATABASE_URL_TEST;
    if (!testUrl) throw new Error("DATABASE_URL_TEST chưa được cấu hình");

    expect(() => createBoss({ connectionString: testUrl })).not.toThrow();
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
      // Test này nhắm vào hành vi RETRY-SAU-THẤT-BẠI nội bộ của `getBoss()`
      // (không phải guard F1 — guard đó đã có test riêng ở trên), nên tạm
      // thoát khỏi NODE_ENV=test để `createBoss()` bên trong `getBoss()`
      // không bị chặn sớm — `getBoss()` vẫn đọc `DATABASE_URL` (biến này
      // được trỏ tạm sang test DB/địa chỉ không kết nối được bên dưới, KHÔNG
      // bao giờ chạm `leafshoes_development` thật trong suốt test). Dùng
      // `vi.stubEnv` (không gán thẳng `process.env.NODE_ENV` — `@types/node`
      // khai báo field này readonly).
      vi.stubEnv("NODE_ENV", "development");

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
      vi.unstubAllEnvs();
    }
  });

  it("singleton phía app không đăng ký schedule vì createBoss mặc định schedule:false", async () => {
    const originalUrl = process.env.DATABASE_URL;
    const testUrl = process.env.DATABASE_URL_TEST;
    if (!testUrl) throw new Error("DATABASE_URL_TEST chưa được cấu hình");

    vi.stubEnv("NODE_ENV", "development");
    process.env.DATABASE_URL = testUrl;
    const scheduleSpy = vi.spyOn(PgBoss.prototype, "schedule");

    try {
      await getBoss();
      expect(scheduleSpy).not.toHaveBeenCalled();
    } finally {
      process.env.DATABASE_URL = originalUrl;
      scheduleSpy.mockRestore();
      vi.unstubAllEnvs();
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
    //
    // Guard F1 (`createBoss()` chặn NODE_ENV=test không connectionString) có
    // test riêng ở trên — test NÀY nhắm vào hành vi cleanup của `getBoss()`,
    // nên tạm thoát NODE_ENV=test để không bị guard chặn trước khi tới được
    // đoạn `createQueue` đang test.
    vi.stubEnv("NODE_ENV", "development");

    let startedInstance: PgBoss | undefined;
    const createQueueSpy = vi
      .spyOn(PgBoss.prototype, "createQueue")
      .mockImplementationOnce(function (this: PgBoss) {
        // Cần bắt lại chính instance `this` mà pg-boss gọi method này lên, để
        // assert `stop()` sau đó được gọi TRÊN ĐÚNG instance đó (không phải một
        // cái khác) — không phải antipattern "alias this cho tiện", đây là cách
        // duy nhất để lấy tham chiếu instance từ trong một `mockImplementationOnce`.
        // eslint-disable-next-line @typescript-eslint/no-this-alias
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
      vi.unstubAllEnvs();
    }
  });

  it("start() TỰ NÓ throw (không tới ensureQueues) → instance đó vẫn phải được stop(), không rò rỉ (F4)", async () => {
    // Cùng kỹ thuật với test ensureQueues() ở trên nhưng spy thẳng vào
    // `PgBoss.prototype.start` — mô phỏng đúng ca F4 nêu: role DB thiếu
    // quyền CREATE trên schema `pgboss` khiến chính `start()` reject, KHÔNG
    // chạy tới `ensureQueues()`.
    vi.stubEnv("NODE_ENV", "development");

    let startedInstance: PgBoss | undefined;
    const startSpy = vi
      .spyOn(PgBoss.prototype, "start")
      .mockImplementationOnce(function (this: PgBoss) {
        // Cần bắt lại chính instance `this` mà pg-boss gọi method này lên, để
        // assert `stop()` sau đó được gọi TRÊN ĐÚNG instance đó (không phải một
        // cái khác) — không phải antipattern "alias this cho tiện", đây là cách
        // duy nhất để lấy tham chiếu instance từ trong một `mockImplementationOnce`.
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        startedInstance = this;
        return Promise.reject(new Error("start() thất bại (giả lập test)"));
      });
    const stopSpy = vi.spyOn(PgBoss.prototype, "stop");

    try {
      await expect(getBoss()).rejects.toThrow("start() thất bại (giả lập test)");

      expect(startedInstance).toBeDefined();
      expect(stopSpy.mock.instances).toContain(startedInstance);
    } finally {
      startSpy.mockRestore();
      stopSpy.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});

describe("enqueueOrderConfirmation — boss.send() trả về null (F2)", () => {
  it("boss.send() resolve null (INSERT ảnh hưởng 0 dòng) → throw, không nuốt âm thầm", async () => {
    const fakeBoss = {
      send: vi.fn().mockResolvedValue(null),
    } as unknown as PgBoss;
    const fakeTx = { $queryRawUnsafe: vi.fn() };

    await expect(
      enqueueOrderConfirmation(fakeTx, { orderCode: "LEAFNULJOB" }, fakeBoss),
    ).rejects.toThrow(/LEAFNULJOB/);

    expect(fakeBoss.send).toHaveBeenCalledTimes(1);
  });

  it("boss.send() resolve một id hợp lệ → KHÔNG throw", async () => {
    const fakeBoss = {
      send: vi.fn().mockResolvedValue("job-id-123"),
    } as unknown as PgBoss;
    const fakeTx = { $queryRawUnsafe: vi.fn() };

    await expect(
      enqueueOrderConfirmation(fakeTx, { orderCode: "LEAFOKJOB1" }, fakeBoss),
    ).resolves.toBeUndefined();
  });
});

describe("enqueuePaymentConfirmed", () => {
  it("boss.send() trả id hợp lệ → gửi payload đã lọc vào đúng queue", async () => {
    const fakeBoss = {
      send: vi.fn().mockResolvedValue("payment-job-id"),
    } as unknown as PgBoss;
    const fakeTx = { $queryRawUnsafe: vi.fn() };

    await expect(
      enqueuePaymentConfirmed(
        fakeTx,
        {
          orderCode: "LEAFPAID01",
          // @ts-expect-error cố tình truyền PII để chứng minh schema loại bỏ
          email: "must-not-persist@example.com",
        },
        fakeBoss,
      ),
    ).resolves.toBeUndefined();

    expect(fakeBoss.send).toHaveBeenCalledTimes(1);
    expect(fakeBoss.send).toHaveBeenCalledWith(
      QUEUE_SEND_PAYMENT_CONFIRMED,
      { orderCode: "LEAFPAID01" },
      expect.objectContaining({ db: expect.anything() }),
    );
  });

  it("boss.send() trả null → throw để transaction không commit thiếu job", async () => {
    const fakeBoss = {
      send: vi.fn().mockResolvedValue(null),
    } as unknown as PgBoss;
    const fakeTx = { $queryRawUnsafe: vi.fn() };

    await expect(
      enqueuePaymentConfirmed(fakeTx, { orderCode: "LEAFNULPAY" }, fakeBoss),
    ).rejects.toThrow("Ghi job xác nhận thanh toán thất bại.");
  });
});
