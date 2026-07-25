import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  occurredAtFromSePay,
  orderCodeFromSePay,
  sePayWebhookPayloadSchema,
  verifySePaySignature,
} from "@/lib/sepay";
import type { SePayWebhookPayload } from "@/lib/sepay";

const validPayload = {
  id: 123456,
  gateway: "MBBank",
  transactionDate: "2026-07-25 14:30:45",
  accountNumber: "0123456789",
  subAccount: null,
  code: "LEAF-ABC123",
  content: "Thanh toan don LEAF-ABC123",
  transferType: "in",
  description: "MBVCB.1234567890.LEAF-ABC123",
  transferAmount: 630000,
  accumulated: 1000000,
  referenceCode: "FT26072512345678",
} satisfies SePayWebhookPayload;

function sign(rawBody: string, timestamp: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

describe("sePayWebhookPayloadSchema", () => {
  it("accepts the complete official webhook payload shape", () => {
    expect(sePayWebhookPayloadSchema.parse(validPayload).id).toBe(123456);
  });

  it("rejects a non-positive inbound transfer", () => {
    expect(() =>
      sePayWebhookPayloadSchema.parse({ ...validPayload, transferAmount: 0 }),
    ).toThrow();
  });
});

describe("orderCodeFromSePay", () => {
  it("trims and uppercases the SePay order code", () => {
    expect(
      orderCodeFromSePay({ ...validPayload, code: " leaf-abc123 " }),
    ).toBe("LEAF-ABC123");
  });

  it("returns null when the SePay payload has no code", () => {
    expect(orderCodeFromSePay({ ...validPayload, code: null })).toBeNull();
  });
});

describe("occurredAtFromSePay", () => {
  it("interprets transactionDate in Vietnam local time", () => {
    expect(occurredAtFromSePay("2026-07-25 14:30:45").toISOString()).toBe(
      "2026-07-25T07:30:45.000Z",
    );
  });
});

describe("verifySePaySignature", () => {
  const secret = "test-only-webhook-secret";
  const now = new Date("2026-07-25T12:00:00.000Z");
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const rawBody = JSON.stringify(validPayload);

  it("accepts an HMAC for the exact raw body", () => {
    expect(
      verifySePaySignature({
        rawBody,
        signature: sign(rawBody, timestamp, secret),
        timestamp,
        secret,
        now,
      }),
    ).toBe(true);
  });

  it("rejects a signature when one byte of the raw body changes", () => {
    expect(
      verifySePaySignature({
        rawBody: `${rawBody} `,
        signature: sign(rawBody, timestamp, secret),
        timestamp,
        secret,
        now,
      }),
    ).toBe(false);
  });

  it("rejects a malformed signature without throwing", () => {
    expect(() =>
      verifySePaySignature({
        rawBody,
        signature: "not-hex",
        timestamp,
        secret,
        now,
      }),
    ).not.toThrow();
    expect(
      verifySePaySignature({
        rawBody,
        signature: "not-hex",
        timestamp,
        secret,
        now,
      }),
    ).toBe(false);
  });

  it.each([
    [-300, true],
    [300, true],
    [-301, false],
    [301, false],
  ])("accepts timestamp offset %i seconds: %s", (offset, expected) => {
    const candidateTimestamp = String(
      Math.floor(now.getTime() / 1000) + offset,
    );

    expect(
      verifySePaySignature({
        rawBody,
        signature: sign(rawBody, candidateTimestamp, secret),
        timestamp: candidateTimestamp,
        secret,
        now,
      }),
    ).toBe(expected);
  });

  it("rejects a missing caller-provided webhook secret", () => {
    expect(
      verifySePaySignature({
        rawBody,
        signature: sign(rawBody, timestamp, secret),
        timestamp,
        secret: "",
        now,
      }),
    ).toBe(false);
  });
});
