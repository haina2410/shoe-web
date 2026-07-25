import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/test/db";

describe("BankTransaction", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("stores an unmatched SePay event without an order and enforces provider id uniqueness", async () => {
    const eventInput = {
      provider: "sepay",
      providerTransactionId: "987654",
      gateway: "MBBank",
      accountNumber: "0000000000",
      transferType: "in",
      amount: 350_000,
      content: "LEAF-ABC123",
      referenceCode: "FT24123",
      occurredAt: new Date("2026-07-25T03:00:00.000Z"),
      rawPayload: { id: 987654 },
    };
    const event = await testPrisma.bankTransaction.create({
      data: eventInput,
    });

    expect(event.status).toBe("RECEIVED");
    expect(event.orderId).toBeNull();
    await expect(
      testPrisma.bankTransaction.create({
        data: { ...eventInput, providerTransactionId: "987654" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
