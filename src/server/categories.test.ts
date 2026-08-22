import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { CategoryBusinessError, deleteCategoryCore } from "./categories";

describe("deleteCategoryCore", () => {
  it("maps a foreign-key race to the guarded category-in-use error", async () => {
    const db = {
      $transaction: vi.fn(async (operation) =>
        operation({
          product: { count: vi.fn().mockResolvedValue(0) },
          category: {
            delete: vi.fn().mockRejectedValue({ code: "P2003" }),
          },
        }),
      ),
    } as unknown as PrismaClient;

    await expect(deleteCategoryCore(db, "cat-1")).rejects.toEqual(
      new CategoryBusinessError("CATEGORY_IN_USE"),
    );
  });
});
