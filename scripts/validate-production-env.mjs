import { pathToFileURL } from "node:url";

export const REQUIRED_PRODUCTION_ENV = [
  "POSTGRES_DB",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "APP_BASE_URL",
  "APP_ENV",
  "CRAWL_POLICY",
  "BOT_TOKEN",
  "VIETQR_BANK_CODE",
  "VIETQR_ACCOUNT_NO",
  "VIETQR_ACCOUNT_NAME",
  "SEPAY_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "MAIL_FROM",
  "MAIL_REPLY_TO",
  "SMOKE_BASE_URL",
  "SMOKE_PRODUCT_PATH",
  // Service `dashboard` nằm cùng compose file nên Compose nội suy hai biến này
  // ở MỌI lệnh, kể cả khi profile `ops` chưa bật. Kiểm ở đây để lỗi đọc được,
  // thay vì một dòng "error while interpolating" của Compose.
  "DASHBOARD_AUTH_USERNAME",
  "DASHBOARD_AUTH_PASSWORD",
];

export function validateProductionEnv(env = process.env) {
  return REQUIRED_PRODUCTION_ENV.filter((name) => {
    const value = env[name]?.trim();
    return (
      !value ||
      (name === "APP_ENV" && value !== "production") ||
      (name === "CRAWL_POLICY" && value !== "allow")
    );
  });
}

const isDirect =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirect) {
  const missing = validateProductionEnv();
  if (missing.length > 0) {
    console.error(`Thiếu biến môi trường production: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("Production environment hợp lệ.");
  }
}
