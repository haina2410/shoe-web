import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BankTransactionStatus } from "@/generated/prisma/enums";
import { resetDb, testPrisma } from "@/test/db";

const { getBossMock } = vi.hoisted(() => ({
  getBossMock: vi.fn(),
}));

vi.mock("@/jobs/queue", () => ({
  getBoss: getBossMock,
  enqueuePaymentConfirmed: vi.fn(),
}));

vi.mock("@/lib/prisma", async () => {
  const { testPrisma: database } = await import("@/test/db");
  return { prisma: database };
});

import { POST } from "@/app/api/webhooks/sepay/route";

const SECRET = "route-integration-secret";
const ACCOUNT_NUMBER = "0000000000";

function requestFor(
  payload: object,
  options: { signature?: string } = {},
): Request {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const signature = createHmac("sha256", SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return new Request("http://localhost/api/webhooks/sepay", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sepay-timestamp": timestamp,
      "x-sepay-signature": options.signature ?? `sha256=${signature}`,
    },
    body: rawBody,
  });
}

describe("POST /api/webhooks/sepay — durable boundary", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    process.env.SEPAY_WEBHOOK_SECRET = SECRET;
    process.env.VIETQR_ACCOUNT_NO = ACCOUNT_NUMBER;
    getBossMock.mockRejectedValue(new Error("simulated queue warmup outage"));
  });

  afterEach(() => {
    delete process.env.SEPAY_WEBHOOK_SECRET;
    delete process.env.VIETQR_ACCOUNT_NO;
  });

  it("keeps exactly one RECEIVED event and the original unknown field when queue warmup fails", async () => {
    const payload = {
      id: 765_432,
      gateway: "MBBank",
      transactionDate: "2026-07-25 14:30:45",
      accountNumber: ACCOUNT_NUMBER,
      subAccount: null,
      code: " leafabc123 ",
      content: "Thanh toan LEAFABC123",
      transferType: "in",
      description: "",
      transferAmount: 630_000,
      accumulated: 1_000_000,
      referenceCode: "",
      futureProviderField: {
        trace: "must-survive-zod",
      },
    };

    await expect(POST(requestFor(payload))).resolves.toMatchObject({
      status: 500,
    });
    await expect(POST(requestFor(payload))).resolves.toMatchObject({
      status: 500,
    });

    const events = await testPrisma.bankTransaction.findMany({
      where: { providerTransactionId: String(payload.id) },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      status: BankTransactionStatus.RECEIVED,
      paymentCode: "LEAFABC123",
      amount: payload.transferAmount,
      orderId: null,
      processedAt: null,
      rawPayload: payload,
    });
    expect(getBossMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "invalid HMAC",
      {
        transferAmount: 630_000,
        accountNumber: ACCOUNT_NUMBER,
      },
      { signature: "sha256=invalid" },
      401,
    ],
    [
      "invalid schema",
      {
        transferAmount: 0,
        accountNumber: ACCOUNT_NUMBER,
      },
      {},
      400,
    ],
    [
      "wrong receiving account",
      {
        transferAmount: 630_000,
        accountNumber: "9999999999",
      },
      {},
      400,
    ],
  ])("writes nothing for %s", async (_label, overrides, options, status) => {
    const payload = {
      id: 765_433,
      gateway: "MBBank",
      transactionDate: "2026-07-25 14:30:45",
      accountNumber: ACCOUNT_NUMBER,
      subAccount: null,
      code: "LEAFABC123",
      content: "Thanh toan LEAFABC123",
      transferType: "in",
      description: "",
      transferAmount: 630_000,
      accumulated: 1_000_000,
      referenceCode: "",
      ...overrides,
    };

    const response = await POST(requestFor(payload, options));

    expect(response.status).toBe(status);
    await expect(testPrisma.bankTransaction.count()).resolves.toBe(0);
    expect(getBossMock).not.toHaveBeenCalled();
  });
});
