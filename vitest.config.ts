import { defineConfig, defaultExclude } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./vitest.globalSetup.ts"],
    exclude: [...defaultExclude, "e2e/**", ".next/**", ".worktrees/**"],
    // Các test tích hợp (`*.integration.test.ts`, `prisma/seed.test.ts`) dùng
    // CHUNG một Postgres test DB thật qua `resetDb()` (TRUNCATE ... CASCADE).
    // Chạy nhiều file test song song (mặc định của Vitest) có thể khiến file
    // A đang dùng 1 category/product vừa tạo thì bị file B TRUNCATE giữa
    // chừng → lỗi khoá ngoại ngẫu nhiên (flaky), không phải lỗi logic. Tắt
    // file-parallelism để các file chạy tuần tự, tránh race này.
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
