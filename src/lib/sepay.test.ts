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
  code: "LEAFABC123",
  content: "Thanh toan don LEAFABC123",
  transferType: "in",
  description: "",
  transferAmount: 630000,
  accumulated: 1000000,
  referenceCode: "",
} satisfies SePayWebhookPayload;

function sign(rawBody: string, timestamp: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

describe("sePayWebhookPayloadSchema", () => {
  it("accepts the complete official webhook payload shape", () => {
    expect(sePayWebhookPayloadSchema.parse(validPayload)).toMatchObject({
      id: 123456,
      description: "",
      referenceCode: "",
    });
  });

  it("rejects a non-positive inbound transfer", () => {
    expect(() =>
      sePayWebhookPayloadSchema.parse({ ...validPayload, transferAmount: 0 }),
    ).toThrow();
  });

  it.each([
    "2026/07/25 14:30:45",
    "2026-07-25T14:30:45",
    "2026-7-25 14:30:45",
    "2026-07-25 14:30",
  ])("rejects malformed transactionDate %s", (transactionDate) => {
    expect(() =>
      sePayWebhookPayloadSchema.parse({ ...validPayload, transactionDate }),
    ).toThrow();
  });

  it("rejects an impossible February 30 date", () => {
    expect(() =>
      sePayWebhookPayloadSchema.parse({
        ...validPayload,
        transactionDate: "2026-02-30 14:30:45",
      }),
    ).toThrow();
  });

  it("accepts a valid leap date", () => {
    expect(
      sePayWebhookPayloadSchema.parse({
        ...validPayload,
        transactionDate: "2028-02-29 23:59:59",
      }).transactionDate,
    ).toBe("2028-02-29 23:59:59");
  });
});

describe("orderCodeFromSePay", () => {
  it("trims and uppercases a canonical SePay order code", () => {
    expect(
      orderCodeFromSePay({ ...validPayload, code: " leafabc123 " }),
    ).toBe("LEAFABC123");
  });

  it("returns null when the SePay payload has no code", () => {
    expect(orderCodeFromSePay({ ...validPayload, code: null })).toBeNull();
  });

  it.each([
    "",
    "LEAF ABC123",
    "LEAFABC12",
    "LEAFABC1234",
    "LEAFABC_12",
    "OTHERABC123",
  ])("returns null for non-canonical code %j", (code) => {
    expect(orderCodeFromSePay({ ...validPayload, code })).toBeNull();
  });
});

describe("occurredAtFromSePay", () => {
  it("interprets transactionDate in Vietnam local time", () => {
    expect(occurredAtFromSePay("2026-07-25 14:30:45").toISOString()).toBe(
      "2026-07-25T07:30:45.000Z",
    );
  });

  it("maps a valid leap date from Vietnam local time", () => {
    expect(occurredAtFromSePay("2028-02-29 23:59:59").toISOString()).toBe(
      "2028-02-29T16:59:59.000Z",
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
