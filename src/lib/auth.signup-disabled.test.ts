import { describe, it, expect, afterAll } from "vitest";
import { auth } from "./auth";
import { prisma } from "./prisma";

describe("đăng ký công khai bị tắt (disableSignUp)", () => {
  it("auth.api.signUpEmail bị từ chối và không tạo bản ghi user", async () => {
    const email = `signup-disabled-${Date.now()}@test.local`;

    await expect(
      auth.api.signUpEmail({
        body: { email, password: "mat-khau-thu-nghiem-123", name: "X" },
      }),
    ).rejects.toThrow();

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeNull();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
