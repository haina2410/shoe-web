import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SePayWebhookPayload } from "@/lib/sepay";

const {
  getBossMock,
  persistSePayEventCoreMock,
  reconcilePersistedSePayEventCoreMock,
  reconcileSePayCoreMock,
  prismaMock,
} = vi.hoisted(() => ({
  getBossMock: vi.fn(),
  persistSePayEventCoreMock: vi.fn(),
  reconcilePersistedSePayEventCoreMock: vi.fn(),
  reconcileSePayCoreMock: vi.fn(),
  prismaMock: { boundary: "test-prisma" },
}));

vi.mock("@/jobs/queue", () => ({
  getBoss: getBossMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/server/payments/reconcile-sepay", () => ({
  persistSePayEventCore: persistSePayEventCoreMock,
  reconcilePersistedSePayEventCore: reconcilePersistedSePayEventCoreMock,
  reconcileSePayCore: reconcileSePayCoreMock,
}));

import { POST, runtime } from "@/app/api/webhooks/sepay/route";

const SECRET = "test-only-route-webhook-secret";
const NOW = new Date("2026-07-25T12:00:00.000Z");
const TIMESTAMP = String(Math.floor(NOW.getTime() / 1000));

const validPayload = {
  id: 123456,
  gateway: "MBBank",
  transactionDate: "2026-07-25 14:30:45",
  accountNumber: "0000000000",
  subAccount: null,
  code: "LEAFABC123",
  content: "Thanh toan don LEAFABC123",
  transferType: "in",
  description: "",
  transferAmount: 630_000,
  accumulated: 1_000_000,
  referenceCode: "",
} satisfies SePayWebhookPayload;

function signatureFor(rawBody: string): string {
  return createHmac("sha256", SECRET)
    .update(`${TIMESTAMP}.${rawBody}`)
    .digest("hex");
}

function webhookRequest(
  rawBody: string,
  options: {
    signature?: string | null;
    timestamp?: string | null;
  } = {},
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  const signature =
    options.signature === undefined
      ? `sha256=${signatureFor(rawBody)}`
      : options.signature;
  const timestamp =
    options.timestamp === undefined ? TIMESTAMP : options.timestamp;

  if (signature !== null) headers.set("x-sepay-signature", signature);
  if (timestamp !== null) headers.set("x-sepay-timestamp", timestamp);

  return new Request("http://localhost/api/webhooks/sepay", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

describe("POST /api/webhooks/sepay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    process.env.SEPAY_WEBHOOK_SECRET = SECRET;
    process.env.VIETQR_ACCOUNT_NO = "0000000000";
    getBossMock.mockResolvedValue(undefined);
    persistSePayEventCoreMock.mockResolvedValue({
      id: "bank-event-1",
      status: "RECEIVED",
    });
    reconcilePersistedSePayEventCoreMock.mockResolvedValue({ kind: "matched" });
    reconcileSePayCoreMock.mockResolvedValue({ kind: "matched" });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.SEPAY_WEBHOOK_SECRET;
    delete process.env.VIETQR_ACCOUNT_NO;
  });

  it.each([
    ["missing", null],
    ["malformed", "not-a-valid-signature"],
  ])(
    "rejects a %s signature before queue warmup or reconciliation",
    async (_label, signature) => {
      const response = await POST(
        webhookRequest(JSON.stringify(validPayload), { signature }),
      );

      expect(response.status).toBe(401);
      expect(getBossMock).not.toHaveBeenCalled();
      expect(persistSePayEventCoreMock).not.toHaveBeenCalled();
      expect(reconcilePersistedSePayEventCoreMock).not.toHaveBeenCalled();
      expect(reconcileSePayCoreMock).not.toHaveBeenCalled();
    },
  );

  it("verifies the HMAC against the exact raw request bytes", async () => {
    const canonicalBody = JSON.stringify(validPayload);
    const request = webhookRequest(`${canonicalBody} `, {
      signature: `sha256=${signatureFor(canonicalBody)}`,
    });
    const textSpy = vi.spyOn(request, "text");

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(textSpy).toHaveBeenCalledTimes(1);
    expect(persistSePayEventCoreMock).not.toHaveBeenCalled();
    expect(reconcilePersistedSePayEventCoreMock).not.toHaveBeenCalled();
    expect(reconcileSePayCoreMock).not.toHaveBeenCalled();
  });

  it("accepts a valid signature over non-canonical JSON without re-reading the body", async () => {
    const rawBody = JSON.stringify(validPayload, null, 2);
    const request = webhookRequest(rawBody);
    const textSpy = vi.spyOn(request, "text");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"success":true}');
    expect(textSpy).toHaveBeenCalledTimes(1);
    expect(persistSePayEventCoreMock).toHaveBeenCalledWith(
      prismaMock,
      validPayload,
      validPayload,
    );
    expect(reconcilePersistedSePayEventCoreMock).toHaveBeenCalledWith(
      prismaMock,
      "bank-event-1",
    );
    expect(reconcileSePayCoreMock).not.toHaveBeenCalled();
  });

  it("persists the original parsed JSON object so unknown provider fields survive", async () => {
    const rawPayload = {
      ...validPayload,
      futureProviderField: {
        trace: "future-value",
      },
    };

    const response = await POST(webhookRequest(JSON.stringify(rawPayload)));

    expect(response.status).toBe(200);
    expect(persistSePayEventCoreMock).toHaveBeenCalledWith(
      prismaMock,
      validPayload,
      rawPayload,
    );
  });

  it.each([
    ["malformed JSON", "{"],
    [
      "invalid schema",
      JSON.stringify({ ...validPayload, transferAmount: 0 }),
    ],
  ])("returns 400 for %s without queue or database work", async (_label, body) => {
    const response = await POST(webhookRequest(body));

    expect(response.status).toBe(400);
    expect(getBossMock).not.toHaveBeenCalled();
    expect(persistSePayEventCoreMock).not.toHaveBeenCalled();
    expect(reconcilePersistedSePayEventCoreMock).not.toHaveBeenCalled();
    expect(reconcileSePayCoreMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the trimmed receiving account does not match configuration", async () => {
    const response = await POST(
      webhookRequest(
        JSON.stringify({ ...validPayload, accountNumber: " 9999999999 " }),
      ),
    );

    expect(response.status).toBe(400);
    expect(getBossMock).not.toHaveBeenCalled();
    expect(persistSePayEventCoreMock).not.toHaveBeenCalled();
    expect(reconcilePersistedSePayEventCoreMock).not.toHaveBeenCalled();
    expect(reconcileSePayCoreMock).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "matched" },
    { kind: "duplicate" },
    { kind: "review-required", reason: "AMOUNT_MISMATCH" },
  ])("acknowledges persisted reconciliation result $kind exactly", async (result) => {
    reconcilePersistedSePayEventCoreMock.mockResolvedValue(result);

    const response = await POST(webhookRequest(JSON.stringify(validPayload)));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"success":true}');
    expect(getBossMock).toHaveBeenCalledTimes(1);
    expect(persistSePayEventCoreMock).toHaveBeenCalledTimes(1);
    expect(reconcilePersistedSePayEventCoreMock).toHaveBeenCalledTimes(1);
    expect(
      persistSePayEventCoreMock.mock.invocationCallOrder[0],
    ).toBeLessThan(getBossMock.mock.invocationCallOrder[0]);
    expect(getBossMock.mock.invocationCallOrder[0]).toBeLessThan(
      reconcilePersistedSePayEventCoreMock.mock.invocationCallOrder[0],
    );
  });

  it("returns a generic 500 when queue warmup fails after durable persistence and does not reconcile", async () => {
    getBossMock.mockRejectedValue(new Error("queue connection leaked detail"));

    const response = await POST(webhookRequest(JSON.stringify(validPayload)));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"success":false}');
    expect(persistSePayEventCoreMock).toHaveBeenCalledTimes(1);
    expect(
      persistSePayEventCoreMock.mock.invocationCallOrder[0],
    ).toBeLessThan(getBossMock.mock.invocationCallOrder[0]);
    expect(reconcilePersistedSePayEventCoreMock).not.toHaveBeenCalled();
    expect(reconcileSePayCoreMock).not.toHaveBeenCalled();
  });

  it("returns a generic 500 when reconciliation has an infrastructure failure", async () => {
    reconcilePersistedSePayEventCoreMock.mockRejectedValue(
      new Error("database query leaked detail"),
    );

    const response = await POST(webhookRequest(JSON.stringify(validPayload)));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"success":false}');
  });

  it.each(["MATCHED", "REVIEW_REQUIRED"])(
    "acknowledges a terminal duplicate %s without queue warmup",
    async (status) => {
      persistSePayEventCoreMock.mockResolvedValue({
        id: "bank-event-1",
        status,
      });

      const response = await POST(webhookRequest(JSON.stringify(validPayload)));

      expect(response.status).toBe(200);
      expect(persistSePayEventCoreMock).toHaveBeenCalledTimes(1);
      expect(getBossMock).not.toHaveBeenCalled();
      expect(reconcilePersistedSePayEventCoreMock).not.toHaveBeenCalled();
    },
  );

  it("uses the Node.js runtime required by HMAC and database dependencies", () => {
    expect(runtime).toBe("nodejs");
  });
});
