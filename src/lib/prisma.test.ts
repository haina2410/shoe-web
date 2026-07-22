import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "./prisma";

describe("kết nối Postgres", () => {
  it("chạy được truy vấn đơn giản", async () => {
    const rows = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1::int AS ok`;
    expect(rows).toEqual([{ ok: 1 }]);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
});
