# Runbook vận hành production

Tài liệu này hướng dẫn deploy Leaf Shoes qua Komodo và Cloudflare Tunnel. Mọi
giá trị bí mật chỉ đặt trong environment của Komodo; không commit, dán vào
Compose, build argument, image, log, Playwright report hoặc snapshot.

## 1. Điều kiện trước khi vận hành

- VPS đã có Docker Engine + Docker Compose, kết nối Server trong Komodo và Git
  access tới repository. Kiểm tra phiên bản Docker/Compose trước lần launch
  đầu tiên.
- `cloudflared` đã chạy dưới dạng **system service** trên VPS; không đưa nó vào
  Stack này và không thêm Caddy, Nginx hay reverse proxy khác.
- Cloudflare đã có public hostname và DNS/Tunnel thuộc đúng tài khoản.
- Kiểm tra tài nguyên trước deploy: `df -h`, `free -h`, và dung lượng Docker
  (`docker system df`). Đủ chỗ cho image build, PostgreSQL, upload và backup.
- Có nơi lưu backup ngoài repository/container. Chọn `BACKUP_DIR` là một thư
  mục host rõ ràng, không bị Docker volume hoặc Git quản lý. Tài khoản chạy
  Komodo Action/Procedure phải sở hữu thư mục này và là tài khoản duy nhất có
  quyền đọc/ghi; provision thư mục với mode `0700`. Script không tự sửa owner
  hoặc mode của thư mục có sẵn.

## 2. Tạo Komodo Stack và environment chung

Tạo Stack từ Git repository, branch `main`, file
`docker-compose.prod.yml`, với project production:

```dotenv
COMPOSE_PROJECT_NAME=leafshoes
APP_HOST_PORT=3000
```

Sao chép **tên biến** từ [`.env.production.example`](../.env.production.example)
vào environment của Komodo rồi điền giá trị thật tại đó. Không copy file ví dụ
thành credential production và không paste secret vào Compose source.

Komodo phải cấp **cùng một environment** cho cả Stack và Action/Procedure
deploy: Stack cần nó để nội suy service/volume/port, còn Action/Procedure gọi
`scripts/deploy-production.sh` cần đúng cùng các biến để validate, build,
migrate, health check và chạy smoke. Nếu hai nơi dùng environment khác nhau,
deploy có thể kiểm tra một target nhưng Stack lại chạy target khác.

Service bình thường là `postgres`, `app`, `worker`; `migrate` và `smoke` là
one-shot job profile `ops`. PostgreSQL không có public port. App chỉ bind
`127.0.0.1:${APP_HOST_PORT}:3000`; database và upload là named volume bền vững
theo project.

### Staging bắt buộc trước production

Tạo Stack staging bằng **cùng** Compose file, nhưng environment riêng:

```dotenv
COMPOSE_PROJECT_NAME=leafshoes-staging
APP_HOST_PORT=3300
```

- Compose sẽ tạo PostgreSQL và uploads named volume riêng theo tên project.
- Public hostname Tunnel staging phải trỏ `http://localhost:3300`.
- Dùng Resend sandbox cùng `MAIL_TO_OVERRIDE`; không dùng sender production khi
  domain chưa verify.
- Không chạy payment SePay thật có kiểm soát cho staging trước khi hoàn tất
  production acceptance.
- Tuyệt đối không để staging và production dùng chung project name, host port,
  database volume, uploads volume, hostname hoặc webhook secret.

## 3. Cloudflare Tunnel origin

Ở production, cấu hình public hostname `leafshoesvietnam.com` tới:

```text
http://localhost:3000
```

Nếu đổi `APP_HOST_PORT`, đổi origin Tunnel thành
`http://localhost:<APP_HOST_PORT>` trong cùng cửa sổ vận hành. Xác nhận service
và log trên VPS:

```bash
sudo systemctl status cloudflared
sudo journalctl -u cloudflared --since '30 minutes ago'
```

Origin không được bind public interface. Không mở port PostgreSQL. Không áp
Cloudflare `Cache Everything` cho `/api/*` hay `/admin/*`; nhất là health,
auth và webhook phải đi tới origin theo request.

## 4. First launch

1. Điền toàn bộ production environment trong Komodo, gồm URL HTTPS thật,
   random secrets, VietQR, Resend và `SMOKE_BASE_URL`/`SMOKE_PRODUCT_PATH`.
2. Xác nhận Tunnel hostname và `APP_HOST_PORT` khớp trước khi chạy Action.
3. Chạy Action/Procedure ở repository checkout của Stack:

   ```bash
   npm run deploy:production
   ```

   Luồng này validate environment (không in secret), build image, đảm bảo
   PostgreSQL healthy, chạy `prisma migrate deploy`, sau đó mới thay app/worker,
   chờ `/api/health` loopback và chạy smoke chỉ đọc. Build hoặc migration lỗi
   phải giữ release app/worker cũ đang chạy.
4. Kiểm tra `https://leafshoesvietnam.com/api/health` trả
   `{"status":"ok"}` và Stack/Komodo báo app healthy, worker running.
5. Chỉ khi đã đặt seed credentials **và** xác nhận production chưa có catalog
   cần giữ, thực hiện bootstrap một lần có chủ đích:

   ```bash
   docker compose -f docker-compose.prod.yml run --rm migrate npm run db:seed
   ```

   Không chạy `prisma db seed` tự động trong deploy thường.

## 5. Deploy thông thường

Review commit/tag và backup trước migration có rủi ro, sau đó chạy trong
Komodo Action/Procedure với production environment chung:

```bash
npm run deploy:production
```

Kết quả mong đợi: image `app`, `worker`, `migrate`, `smoke` build thành công;
PostgreSQL healthy; migration one-shot exit `0`; app health trên loopback trả
`200`; worker vẫn running; smoke hoàn thành 3 test request-only. Không dùng
`.env.example` như production credential.

Xem trạng thái và log (chỉ xem trong environment có đúng project):

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=200 app worker postgres
```

## 6. Backup

Backup trước launch, trước migration rủi ro và theo lịch vận hành. Trên host
VPS, với production environment đã được Komodo cấp:

```bash
BACKUP_DIR=/srv/leafshoes-backups npm run backup:production
```

Script tạo custom-format PostgreSQL dump và stream archive uploads về file do
host sở hữu, không tự xóa backup cũ. Host áp dụng `umask 077`: thư mục mới do
script tạo có mode `0700`, hai file backup có mode `0600`. Script ghi vào file
tạm private, chỉ rename sang tên timestamped sau khi cả dump và archive đều
hoàn tất, không rỗng. Nếu một bước lỗi, file tạm và lock được dọn, không publish
artifact dở dang. Nếu một trong hai tên file của timestamp đã tồn tại, hoặc một
tiến trình khác đang dùng cùng timestamp, script thoát lỗi trước khi ghi và
không overwrite. Giữ nguyên các file cũ và chạy lại sau khi timestamp UTC đã
thay đổi.

Xác nhận owner/mode đúng, cả hai file timestamped tồn tại và không rỗng:

```bash
find /srv/leafshoes-backups -maxdepth 1 -type f -size +0c -print
stat -c '%U %G %a %n' /srv/leafshoes-backups \
  /srv/leafshoes-backups/postgres-*.dump \
  /srv/leafshoes-backups/uploads-*.tar.gz
```

Owner phải là tài khoản chạy backup; mode mong đợi lần lượt là `700` cho thư
mục và `600` cho từng artifact. Lưu backup ngoài container/repository và ghi
lại timestamp cùng Git release.

## 7. Restore drill có thể xóa bỏ

Không bao giờ restore đè production để thử. Tạo project/volume drill riêng và
thay đường dẫn dump/archive bằng backup cần kiểm thử:

```bash
export COMPOSE_PROJECT_NAME=leafshoes-restore-drill
export DRILL_DB=leafshoes_restore_drill
export DRILL_USER=leafshoes_restore_drill
export DRILL_PASSWORD=replace-with-disposable-password
export BACKUP_DIR=/srv/leafshoes-backups
export DB_DUMP="$BACKUP_DIR/postgres-YYYYMMDDTHHMMSSZ.dump"
export UPLOADS_ARCHIVE="$BACKUP_DIR/uploads-YYYYMMDDTHHMMSSZ.tar.gz"
export UPLOADS_DIR=/tmp/leafshoes-restore-drill-uploads

docker volume create leafshoes-restore-drill-postgres
docker run -d --name leafshoes-restore-drill-db \
  --label com.docker.compose.project="$COMPOSE_PROJECT_NAME" \
  -e POSTGRES_DB="$DRILL_DB" -e POSTGRES_USER="$DRILL_USER" \
  -e POSTGRES_PASSWORD="$DRILL_PASSWORD" \
  -v leafshoes-restore-drill-postgres:/var/lib/postgresql/data \
  postgres:17-alpine
until docker exec leafshoes-restore-drill-db \
  pg_isready -U "$DRILL_USER" -d "$DRILL_DB"; do sleep 2; done
docker cp "$DB_DUMP" leafshoes-restore-drill-db:/tmp/restore.dump
docker exec leafshoes-restore-drill-db pg_restore --clean --if-exists \
  --no-owner --username "$DRILL_USER" --dbname "$DRILL_DB" /tmp/restore.dump
mkdir -p "$UPLOADS_DIR"
tar -xzf "$UPLOADS_ARCHIVE" -C "$UPLOADS_DIR"
docker exec leafshoes-restore-drill-db psql -U "$DRILL_USER" -d "$DRILL_DB" \
  -c 'SELECT count(*) AS users FROM "User";'
find "$UPLOADS_DIR" -type f | wc -l
```

Record database count and upload-file count; then remove **only** this named
drill target and its temporary uploads directory after checking the project
name:

```bash
docker rm -f leafshoes-restore-drill-db
docker volume rm leafshoes-restore-drill-postgres
rm -rf /tmp/leafshoes-restore-drill-uploads
```

The explicit project name is the safety boundary. Never run either command
with `leafshoes` or `leafshoes-staging`.

## 8. Rollback

1. Record current Git SHA/tag, deploy timestamp and backup paths.
2. Identify the prior known-good commit/tag and redeploy it through the same
   Action/Procedure.
3. Never run a migration down automatically. New migrations should be
   expand/contract compatible with the previous app release.
4. If schema compatibility is broken, stop normal traffic only in an approved
   maintenance window and restore the recorded production backup deliberately.
   A restore is not an automatic rollback step.

## 9. Resend email acceptance

Before domain verification, set `MAIL_FROM=onboarding@resend.dev` and set
`MAIL_TO_OVERRIDE` to the Resend account owner mailbox. This sandbox sender is
only for controlled acceptance and prevents customer delivery.

After Resend verifies `leafshoesvietnam.com`, change to:

```dotenv
MAIL_FROM=no-reply@leafshoesvietnam.com
MAIL_REPLY_TO=leafshoesvietnam@gmail.com
```

Confirm one controlled order causes the worker to send the expected email,
with production HTTPS order link. Do not place a real Resend API key in Git or
logs.

## 10. SePay and VietQR acceptance

Configure SePay production webhook at:

```text
https://leafshoesvietnam.com/api/webhooks/sepay
```

Use a unique random `SEPAY_WEBHOOK_SECRET`, configured identically in SePay
and the Komodo production environment. Confirm receiving account details,
VietQR output and the payment-code prefix `LEAF`. During production launch,
perform one controlled test order/payment only after the operator approves it:

1. create test order and confirm VietQR amount/account/code;
2. send the controlled SePay `IN` payment;
3. confirm payment is recorded once, even when the same webhook is replayed;
4. confirm worker email and owner/staff order view;
5. document the order/payment and clean up according to business policy.

Do not run a controlled real SePay payment against staging before this
production acceptance step.

## 11. Manual acceptance after first deploy

- Public home, catalog, known product and login all render through HTTPS.
- `/api/health` reports ready and is non-cacheable.
- VietQR displays correct receiving account, amount and `LEAF` payment code.
- Controlled SePay `IN` is recorded idempotently and worker sends email.
- Owner and staff can sign in and inspect the order.
- Upload a controlled product image, redeploy app, and confirm the image
  survives via the persistent uploads volume.

## 12. Diagnosis and incident triage

From the correct Stack checkout/environment:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=200 app
docker compose -f docker-compose.prod.yml logs --tail=200 worker
docker compose -f docker-compose.prod.yml logs --tail=200 postgres
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
docker compose -f docker-compose.prod.yml run --rm migrate \
  ./node_modules/.bin/prisma migrate status
docker volume ls | grep leafshoes
df -h
free -h
sudo systemctl status cloudflared
sudo journalctl -u cloudflared --since '30 minutes ago'
```

Check Komodo alerts for unhealthy containers, restart loops, disk/RAM pressure
and failed Action runs. App, worker and migration logs go to stdout/stderr;
do not paste database URLs, secrets or full sensitive webhook payloads into an
incident ticket.

## 13. Security checklist

- [ ] Production and staging have distinct project name, loopback host port,
  database/uploads volumes, hostname and SePay webhook secret.
- [ ] App binds only `127.0.0.1`; PostgreSQL has no published port; no public
  origin bypasses Cloudflare Tunnel.
- [ ] `cloudflared` is healthy and only forwards the intended hostname/origin.
- [ ] Cloudflare does not cache `/api/*` or `/admin/*` with `Cache Everything`.
- [ ] Komodo alone holds real secrets; Git, images, build args, logs and test
  reports do not contain them.
- [ ] PostgreSQL and uploads volumes persist; latest non-empty backup and a
  disposable restore drill have been verified; backup directory is owner-only
  (`0700`) and artifacts are mode `0600`.
- [ ] Automatic deploy never runs seed, payment, upload, user or order creation;
  smoke remains request-only.
