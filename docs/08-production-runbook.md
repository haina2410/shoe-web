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
- VPS pull được image release từ `ghcr.io`. Repository `haina2410/shoe-web` đang
  là public nên package cũng public: **không cần credential nào để pull** — đã
  xác nhận bằng `docker manifest inspect` từ một host chưa `docker login`.
  Không có secret nào bị bake vào image: build chỉ dùng giá trị giả (xem
  `Dockerfile`), mọi secret thật đến từ environment lúc container chạy.

  Nếu về sau repository chuyển sang private thì package thành private theo, và
  VPS phải đăng nhập bằng token **chỉ có `read:packages`**, đặt trong
  environment Komodo chứ không viết thẳng vào lệnh:

  ```bash
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
  ```
- Kiểm tra tài nguyên trước deploy: `df -h`, `free -h`, và dung lượng Docker
  (`docker system df`). Đủ chỗ cho image, PostgreSQL, upload và backup. Deploy
  bình thường chỉ pull nên không cần chỗ cho build cache; đường thoát
  `BUILD_LOCALLY=1` thì cần.
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
RELEASE_TAG=latest
APP_HOST_PORT=3000
```

`RELEASE_TAG` quyết định tag image được pull. Nếu không đặt, Compose dùng
`latest`; một production release có thể đặt nó thành full commit SHA đã được
workflow `Publish images` đẩy lên GHCR. `scripts/deploy-production.sh` tôn trọng
giá trị này và ép pull trước khi migrate/deploy. Không `up` Stack production
trực tiếp: `pull_policy: missing` có thể giữ image cũ ở local.

Sao chép **tên biến** từ [`.env.production.example`](../.env.production.example)
vào environment của Komodo rồi điền giá trị thật tại đó. Không copy file ví dụ
thành credential production và không paste secret vào Compose source.

Komodo phải cấp **cùng một environment** cho cả Stack và Action/Procedure
deploy: Stack cần nó để nội suy service/volume/port, còn Action/Procedure gọi
`scripts/deploy-production.sh` cần đúng cùng các biến để validate, build,
migrate, health check và chạy smoke. Nếu hai nơi dùng environment khác nhau,
deploy có thể kiểm tra một target nhưng Stack lại chạy target khác.

Service thường trực là `postgres`, `app`, `worker`. `migrate` là one-shot: chạy
`prisma migrate deploy` rồi thoát `0`, và `app`/`worker` khai
`depends_on: migrate: service_completed_successfully`, nên mọi `docker compose
up` đều migrate xong mới cho app lên. Hai hệ quả cần biết:

- Komodo sẽ báo Stack **Unhealthy (đỏ)**: nó suy trạng thái Stack từ state của
  các container và chỉ trả về màu xanh khi *tất cả* cùng `Running` — `migrate`
  đứng ở `Exited` là đủ để thành "mixed". Exit code không được xét tới. Cách xử
  lý là thêm `migrate` vào **`ignore_services`** trong Stack config; Komodo lọc
  service theo tên khỏi phép tính trước khi so container.
- Bỏ qua `migrate` như vậy **không** che được migration hỏng: migrate fail thì
  `app`/`worker` không khởi động (`service_completed_successfully`), Stack thiếu
  container nên vẫn Unhealthy. Tín hiệu chuẩn xác nhất vẫn là exit code của
  Action deploy.
- Từ nay `up` là một thao tác **có sửa schema**. Migration rủi ro thì backup
  trước khi `up`, đúng như trước khi chạy Action deploy.

`smoke` vẫn nằm trong profile `ops`, nên nó không xuất hiện khi Komodo parse
config — đó là chủ đích, gọi tên tường minh (`compose run --rm smoke`) mới chạy.

PostgreSQL không có public port. App chỉ bind
`127.0.0.1:${APP_HOST_PORT}:3000`; database và upload là named volume bền vững
theo project.

### Staging bắt buộc trước production

Tạo Stack staging bằng **cùng** Compose file, nhưng environment riêng:

```dotenv
COMPOSE_PROJECT_NAME=leafshoes-staging
RELEASE_TAG=latest
APP_HOST_PORT=3300
```

- Compose sẽ tạo PostgreSQL và uploads named volume riêng theo tên project.
- Public hostname Tunnel staging phải trỏ `http://localhost:3300`.
- Dùng Resend sandbox cùng `MAIL_TO_OVERRIDE`; không dùng sender production khi
  domain chưa verify.
- Không chạy payment SePay thật có kiểm soát cho staging trước khi hoàn tất
  production acceptance.
- Tuyệt đối không để staging và production dùng chung project name, host port,
  database volume, uploads volume, hostname hoặc webhook URL.

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

   Luồng này validate environment (không in secret), pull image theo
   `RELEASE_TAG` từ `ghcr.io`, đảm bảo PostgreSQL healthy, chạy `prisma migrate
   deploy`, sau đó mới thay app/worker, chờ `/api/health` loopback và chạy smoke
   chỉ đọc. Pull hoặc migration lỗi phải giữ release app/worker cũ đang chạy —
   pull chạy trước khi động vào container nào nên đây là điểm dừng an toàn.
4. Kiểm tra `https://leafshoesvietnam.com/api/health` trả
   `{"status":"ok"}` và Stack/Komodo báo app healthy, worker running.
5. Bootstrap dữ liệu. Chỉ làm khi đã đặt seed credentials **và** xác nhận
   database chưa có catalog cần giữ. Có hai đường, dùng đúng đường cho đúng việc:

   **Staging dựng lại từ đầu — đặt `SEED=1`.** Service `migrate` sẽ seed ngay
   sau khi migrate xong, nhưng chỉ khi catalog còn rỗng: đã có sản phẩm là nó in
   `[seed] Bỏ qua` rồi thoát `0`. Nhờ vậy `SEED=1` sót lại không phá shop ở lần
   `up` sau.

   **Re-seed có chủ đích — gọi tay, không qua cờ.** Đường này *không* có chốt,
   nó thật sự ghi đè:

   ```bash
   docker compose -f docker-compose.prod.yml run --rm migrate npm run db:seed
   ```

   Nhánh `update` của seed đặt lại `stock`, `basePrice`, `status: ACTIVE` và
   xoá-tạo-lại toàn bộ ảnh sản phẩm. Trên shop đang bán, đó là mất tồn kho, mất
   giá đã sửa và mất ảnh đã upload. Backup trước khi chạy.

   **Không đặt `SEED` trong environment production.** Chốt catalog-rỗng là lưới
   an toàn cho sự cố, không phải giấy phép để bật thường trực.

## 5. Deploy thông thường

Trong GitHub Actions, cấu hình:

- repository variable `KOMODO_STAGING_URL`: URL gốc của Komodo staging;
- repository variable `KOMODO_PRODUCTION_URL`: URL gốc của Komodo production;
- repository secret `KOMODO_API_KEY`: API key có quyền pull/deploy Stack;
- repository secret `KOMODO_API_SECRET`: secret đi cùng API key;
- repository variable `KOMODO_STAGING_STACK_NAME`: tên Stack staging;
- repository variable `KOMODO_PRODUCTION_STACK_NAME`: tên Stack production.

Workflow dùng `pandeptwidyaop/komodoactions@v1` để gọi Komodo API. Staging chạy
sau khi toàn bộ image của một push `main` được publish; production chạy khi một
GitHub Release không phải prerelease được publish. Cả hai bật
`pull-before-deploy`, chờ PullStack thành công rồi mới gọi DeployStack.

API action không sửa environment của Stack và không truyền GitHub Release tag
vào Compose. Tag deploy là `RELEASE_TAG` đang cấu hình trong Komodo; bỏ trống thì
Compose dùng `latest`. Vì vậy GitHub Release chỉ là cổng kích hoạt production.
Muốn deploy một full commit SHA cụ thể, đặt `RELEASE_TAG` của Stack production
thành SHA đã được workflow `Publish images` build trước khi publish Release.
Draft và prerelease không deploy production.

Kết quả mong đợi: image `app`, `worker`, `migrate`, `smoke` pull thành công ở
tag trong `RELEASE_TAG`; PostgreSQL healthy; migration one-shot exit `0`; app và
worker running. DeployStack chạy Compose trực tiếp nên không chạy health loop và
smoke test của `scripts/deploy-production.sh`; chạy `npm run test:smoke` riêng
khi release cần acceptance đầy đủ. Không dùng `.env.example` như production
credential.

Khi registry không tới được (GitHub sự cố, mạng VPS hỏng) mà vẫn buộc phải
deploy, dùng đường thoát build tại chỗ — nó build đúng bốn target rồi gắn cùng
tên image, và lần deploy bình thường kế tiếp sẽ pull đè lại bản của CI:

```bash
BUILD_LOCALLY=1 npm run deploy:production
```

Xem trạng thái và log (chỉ xem trong environment có đúng project):

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=200 app worker postgres
```

### Dọn image GHCR cũ

Workflow `Cleanup images` chạy lúc 03:00 sáng thứ Hai theo giờ Việt Nam và có
thể chạy tay. Nó dùng `actions/delete-package-versions@v5` cho `app`, `worker`,
`migrate`, `smoke`, `dashboard` và giữ 20 version mới nhất của từng package.

Repository phải có quyền **Admin** trong **Package settings → Manage Actions
access** của cả năm package để `GITHUB_TOKEN` xoá version. Policy chỉ xét độ mới;
commit/release cũ hơn 20 version có thể bị xoá và không còn dùng được để
rollback.

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
   Action/Procedure. The deploy pulls that commit's published image instead of
   rebuilding, so a rollback costs one pull. If its image is missing, the
   `Publish images` workflow for that commit never completed — rerun the
   workflow rather than building an untested image on the host.
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

### Dashboard pg-boss (xem và retry job)

Job nền thất bại thì `docker compose logs worker | grep "job thất bại"` cho ra
`jobId` và `orderCode` ngay. Cần nhìn toàn bộ queue hoặc retry bằng UI thì dựng
`@pg-boss/dashboard` lên tạm:

```bash
docker compose -f docker-compose.prod.yml --profile ops up -d dashboard
```

`DASHBOARD_AUTH_USERNAME` và `DASHBOARD_AUTH_PASSWORD` phải nằm trong
environment Komodo như mọi biến bắt buộc khác — thiếu là **mọi** lệnh compose
báo lỗi, không riêng lệnh này. Cố ý như vậy: bỏ trống cặp đó thì dashboard chạy
**không xác thực** trong khi nó retry và xoá job được. Coi nó ngang quyền ghi
vào production.

Nó chỉ bind `127.0.0.1:${DASHBOARD_HOST_PORT:-3010}` (không phải 3000 — `app`
đang giữ port đó) và **không** đi qua Cloudflare Tunnel. Mở từ máy mình bằng SSH
port-forward, đừng thêm public hostname:

```bash
ssh -N -L 3010:127.0.0.1:3010 <user>@<vps>
```

Xong việc thì bỏ hẳn container, đừng để nó chạy thường trực:

```bash
docker compose -f docker-compose.prod.yml --profile ops rm -sf dashboard
```

`dashboard` và `smoke` đều thuộc profile `ops`, nên `up` thường không dựng chúng
và Komodo cũng không thấy chúng khi parse config — trạng thái Stack không bị ảnh
hưởng.

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
- [ ] Release images carry no secrets: build arguments are placeholders only and
  every real value arrives from the runtime environment. Published packages are
  public because the repository is; if the repository is ever made private, the
  host's `ghcr.io` credential must be read-only (`read:packages`) and live in the
  Komodo environment, not in shell history or a checked-in file.
- [ ] PostgreSQL and uploads volumes persist; latest non-empty backup and a
  disposable restore drill have been verified; backup directory is owner-only
  (`0700`) and artifacts are mode `0600`.
- [ ] The production environment does not define `SEED`. Automatic deploy never
  runs payment, upload, user or order creation; seed runs only when `SEED=1` is
  set deliberately, and even then only into an empty catalog. Smoke remains
  request-only.
