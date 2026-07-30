# Ngày 10 — Production deployment với Komodo và Cloudflare Tunnel

Ngày: 2026-07-31  
Trạng thái: đã được người dùng duyệt trong brainstorming

## 1. Mục tiêu

Ngày 10 đưa MVP Leaf Shoes từ trạng thái chạy và kiểm thử cục bộ lên một VPS
production đã có Komodo và `cloudflared` system service. Kết quả cần đạt:

1. build được các image production có thể lặp lại;
2. deploy app, worker và PostgreSQL bằng Docker Compose do Komodo quản lý;
3. migration chạy trước khi phiên bản app/worker mới được thay vào;
4. website chỉ được truy cập từ Cloudflare Tunnel, không mở origin công khai;
5. dữ liệu PostgreSQL và ảnh upload tồn tại qua các lần thay container;
6. có healthcheck, smoke test, backup/restore runbook và rollback runbook;
7. có checklist nghiệm thu SePay, VietQR và email thật.

Ngày 10 không mở rộng nghiệp vụ ecommerce hoặc polish storefront.

## 2. Bối cảnh và quyết định đã chốt

- VPS và Komodo đã tồn tại.
- `cloudflared` đang chạy dưới dạng system service trên VPS.
- Không dùng Caddy, Nginx hoặc reverse proxy khác trong stack Leaf Shoes.
- Komodo quản lý Compose stack lấy từ Git, environment, deploy, health và log.
- Hệ thống vẫn là một Next.js app, một pg-boss worker và một PostgreSQL.
- Ảnh sản phẩm vẫn được lưu trên filesystem qua `UPLOAD_DIR`.
- Không cài Grafana hoặc observability stack nặng cho MVP.
- Domain production dự kiến là `leafshoesvietnam.com`; mọi file cấu hình trong
  repo phải cho phép đổi hostname bằng environment, không hard-code secret.

## 3. Kiến trúc runtime

```text
Browser / SePay
      |
      | HTTPS
      v
Cloudflare edge
      |
      | outbound Cloudflare Tunnel
      v
cloudflared system service
      |
      | http://127.0.0.1:3000
      v
Next.js app ---------> PostgreSQL <--------- pg-boss worker
      |                    ^
      |                    |
      +---- upload volume  +--------- migration job
```

Compose có bốn service:

- `postgres`: database duy nhất, có healthcheck và persistent volume;
- `migrate`: process chạy một lần để thực thi `prisma migrate deploy`;
- `app`: Next.js standalone server;
- `worker`: pg-boss worker xử lý email và lịch hết hạn đơn chưa thanh toán.

`app` chỉ publish `127.0.0.1:3000:3000`. Không service nào publish PostgreSQL
hoặc worker port. `cloudflared` trên host trỏ public hostname tới
`http://localhost:3000`.

Nếu cổng loopback `3000` đã được sử dụng, `APP_HOST_PORT` có thể đổi trong
Komodo và origin của Tunnel phải đổi cùng giá trị. Container app vẫn nghe cổng
`3000` trong Docker network.

## 4. Docker image

Một Dockerfile nhiều stage là nguồn duy nhất cho ba runtime target.

### 4.1 App target

- Build bằng phiên bản Node tương thích với repository.
- Bật `output: "standalone"` trong `next.config.ts`.
- Copy `.next/standalone`, `.next/static` và `public` đúng theo tài liệu Next.js
  16 trong `node_modules/next/dist/docs/`.
- Chạy minimal `server.js` với `HOSTNAME=0.0.0.0` và `PORT=3000`.
- Chạy bằng non-root user.
- Không chứa source, test runner hoặc toàn bộ development dependencies nếu
  standalone trace không cần chúng.

### 4.2 Worker target

- Dùng cùng commit và generated Prisma client với app.
- Chứa source/runtime dependencies cần cho `src/worker/index.ts`.
- Có `tsx` tại runtime hoặc một output worker đã compile; implementation plan
  phải chọn phương án ít thay đổi và kiểm chứng được trong container.
- Chạy bằng non-root user.
- Nhận cùng `DATABASE_URL`, mail, VietQR và `APP_BASE_URL` qua runtime
  environment.

### 4.3 Migration target

- Chứa Prisma CLI, schema, migrations, Prisma config và generated artifacts cần
  cho `prisma migrate deploy`.
- Là image/job riêng, không cài Prisma CLI vào app standalone.
- Kết thúc với exit code khác `0` nếu migration thất bại.
- Không chạy seed tự động.

Các image phải có `.dockerignore` loại `.git`, `.next`, local environment,
coverage, Playwright artifacts, local uploads và `node_modules` khỏi build
context.

## 5. Compose, storage và health

### 5.1 PostgreSQL

- Pin một major version PostgreSQL cụ thể, không dùng floating `latest`.
- Đọc tên database, user và password từ Komodo environment.
- Có `pg_isready` healthcheck.
- Dùng named volume cho `/var/lib/postgresql/data`.
- Không publish cổng `5432`.
- Restart policy phù hợp cho service dài hạn.

### 5.2 App

- Phụ thuộc PostgreSQL healthy.
- Mount upload volume vào đường dẫn cố định, ví dụ `/data/uploads`.
- `UPLOAD_DIR=/data/uploads`.
- Chỉ bind host loopback qua `${APP_HOST_PORT:-3000}:3000`.
- Có healthcheck gọi `/api/health`.
- Có stop grace period đủ để Next.js kết thúc request đang xử lý.

### 5.3 Worker

- Phụ thuộc PostgreSQL healthy và migration thành công.
- Dùng cùng production environment với app, trừ các biến chỉ app mới cần.
- Không mount upload volume nếu worker không đọc/ghi ảnh.
- Restart nếu process lỗi.
- Container đang chạy là liveness cơ bản; xác nhận enqueue/consume job nằm
  trong acceptance test thay vì thêm một HTTP server chỉ để healthcheck.

### 5.4 Migration

- Chờ PostgreSQL healthy.
- `restart: "no"`.
- Được Komodo bỏ qua khi đánh giá các long-running service vì trạng thái thành
  công của job là `exited (0)`.
- Deploy workflow phải chạy migration mỗi release trước khi thay app/worker;
  không chỉ phụ thuộc vào việc Compose có quyết định recreate container cũ hay
  không.

## 6. Health endpoint

Thêm `GET /api/health` với contract:

- trả `200` và payload tối thiểu như `{"status":"ok"}` khi process app hoạt động
  và truy vấn database nhẹ thành công;
- trả `503` với payload chung khi database không sẵn sàng;
- không trả connection string, stack trace, phiên bản dependency hoặc secret;
- không yêu cầu đăng nhập;
- đặt response là non-cacheable.

Endpoint là readiness cho Compose, Komodo và smoke test. Process/container
health riêng vẫn là liveness.

## 7. Trình tự deploy

Repository cung cấp một entrypoint deploy idempotent để Komodo Action/Procedure
có thể gọi trong run directory:

1. validate các biến bắt buộc mà không in giá trị secret;
2. build app, worker và migration image mới trong khi release cũ còn chạy;
3. start/ensure PostgreSQL và chờ healthcheck;
4. chạy migration job mới bằng container tạm;
5. nếu migration thành công, reconcile app và worker sang image mới;
6. chờ `/api/health` trên loopback;
7. chạy production smoke test;
8. trả exit code khác `0` ở bước lỗi để Komodo ghi nhận deployment thất bại.

Nếu build hoặc migration lỗi, release app/worker cũ không bị thay. Nếu app mới
không healthy, deploy được đánh dấu thất bại và runbook hướng dẫn quay lại
release trước.

Komodo configuration nên giữ Stack lấy Compose từ Git và một
Action/Procedure chạy các stage tuần tự. Webhook auto-deploy chỉ được bật sau
khi deployment thủ công đầu tiên và rollback đã được diễn tập thành công.

## 8. Environment và secrets

Repository commit `.env.production.example` chỉ chứa tên biến và mô tả an toàn.
Giá trị thật nằm trong Komodo Stack/Action environment.

Nhóm biến bắt buộc:

- PostgreSQL và `DATABASE_URL`;
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`;
- `APP_BASE_URL`;
- `UPLOAD_DIR`, optional `MAX_UPLOAD_BYTES`;
- VietQR bank/account fields;
- `SEPAY_WEBHOOK_SECRET`;
- `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO`;
- optional `MAIL_TO_OVERRIDE`;
- `APP_HOST_PORT`.

Giá trị production dự kiến:

- `BETTER_AUTH_URL=https://leafshoesvietnam.com`;
- `APP_BASE_URL=https://leafshoesvietnam.com`;
- `MAIL_FROM=no-reply@leafshoesvietnam.com` sau khi Resend xác minh domain;
- `MAIL_REPLY_TO=leafshoesvietnam@gmail.com`.

Trước khi Resend xác minh domain, chỉ dùng sender sandbox và
`MAIL_TO_OVERRIDE`; không giả mạo địa chỉ Gmail trong `MAIL_FROM`.

Không đưa secret vào Docker build args, image layer, repository, log hoặc
Playwright report.

## 9. Cloudflare Tunnel

Cloudflare Tunnel nằm ngoài Compose và ngoài lifecycle của app:

- public hostname trỏ tới `http://localhost:${APP_HOST_PORT}`;
- không publish origin qua public interface;
- firewall không cần mở cổng web inbound cho Leaf Shoes;
- đảm bảo outbound của `cloudflared` vẫn hoạt động;
- `/api/*` và `/admin/*` không được đặt rule `Cache Everything`;
- SePay webhook đi qua cùng hostname và được app xác thực bằng secret;
- thay đổi origin/hostname là bước vận hành thủ công có ghi trong runbook,
  không tự động ghi đè cấu hình Tunnel đang dùng cho service khác.

## 10. Backup và rollback

### 10.1 Backup

Trước production launch và trước migration có rủi ro:

- tạo logical PostgreSQL backup bằng `pg_dump`;
- archive upload volume;
- lưu ngoài container và ghi rõ timestamp/release;
- kiểm tra file không rỗng;
- diễn tập restore vào database/volume tạm, không restore đè production để
  “thử”.

Ngày 10 cung cấp command/runbook có biến target rõ ràng. Không tự động xoá
backup cũ.

### 10.2 Rollback

- Xác định release bằng Git commit/tag.
- Rebuild/deploy commit trước bằng cùng workflow.
- Không chạy migration down tự động.
- Migrations mới phải ưu tiên expand/contract và tương thích ít nhất với
  release trước.
- Nếu migration phá vỡ tương thích, rollback cần restore backup trong một
  maintenance window có chủ đích; không được ngầm thực hiện.

## 11. Testing và production acceptance

Mọi behavior mới đi theo RED → GREEN.

### 11.1 Automated tests

- unit/integration test contract `/api/health`;
- tests cho validation biến production và deploy helper có logic;
- Docker image build cho cả app, worker và migrate;
- Compose config validation;
- app container health với PostgreSQL thật;
- worker container start và kết nối pg-boss;
- migration chạy thành công trên database trống và idempotent trên database đã
  migrate;
- giữ toàn bộ lint, unit/integration và E2E hiện có.

### 11.2 Remote smoke

Playwright smoke config nhận `SMOKE_BASE_URL` và không tự start local server.
Smoke tự động chỉ thực hiện các bước không phá dữ liệu:

- `/api/health`;
- homepage;
- catalog;
- một product detail có seed/fixture production đã biết;
- trang đăng nhập admin.

Không chạy checkout tạo dữ liệu thật trong mỗi auto-deploy.

### 11.3 Manual acceptance

Một lần trước launch, dùng product/order test có kiểm soát để xác nhận:

1. tạo đơn;
2. hiển thị đúng VietQR;
3. nhận webhook SePay production;
4. payment `IN` được ghi nhận đúng và idempotent;
5. worker gửi email xác nhận;
6. link trong email dùng production HTTPS URL;
7. owner/staff đăng nhập và thấy đơn;
8. upload ảnh vẫn tồn tại sau khi redeploy app.

## 12. Logging và chẩn đoán

- App, worker và migration log ra stdout/stderr để Komodo thu thập.
- Không log secret, full webhook payload nhạy cảm hoặc database URL.
- Worker log queue/job name và identifier an toàn đủ để đối chiếu.
- Runbook có command xem log theo service, trạng thái health, migration history,
  disk/volume và `cloudflared` system service.
- Komodo alert cơ bản cho container unhealthy/restart loop và VPS disk/RAM là
  đủ cho MVP.

## 13. Documentation deliverables

Ngày 10 cập nhật hoặc thêm:

- Dockerfile và `.dockerignore`;
- production Compose;
- `.env.production.example`;
- deploy/backup/restore/smoke scripts cần thiết;
- production runbook cho Komodo và Cloudflare Tunnel;
- README link tới runbook;
- checklist launch cho domain, Resend, SePay và tài khoản admin.

Tài liệu phải chỉ rõ bước nào tự động, bước nào chủ cửa hàng/người vận hành cần
cung cấp credential hoặc xác nhận bằng dashboard bên thứ ba.

## 14. Ngoài phạm vi Ngày 10

- Kubernetes, Swarm hoặc nhiều app replica;
- Redis/shared Next.js cache;
- zero-downtime blue/green hoàn chỉnh;
- Grafana, Loki, Prometheus hoặc APM trả phí;
- CDN/object storage riêng cho upload;
- automated database PITR;
- các mục storefront backlog sau Ngày 10;
- tự động chuyển tiền/refund;
- tự động chỉnh sửa Cloudflare, Resend hoặc SePay account khi chưa có
  credential và quyền rõ ràng.
