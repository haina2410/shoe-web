import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST chưa được cấu hình");

export const testPrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

// Xoá dữ liệu nghiệp vụ theo thứ tự FK (không đụng bảng auth).
export async function resetDb() {
  await testPrisma.$executeRawUnsafe(
    `TRUNCATE "order_item","payment","order","variant","product_image","product","category","province_zone","shipping_zone" RESTART IDENTITY CASCADE;`,
  );
}
