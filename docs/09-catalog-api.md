# 09 — Catalog API

Catalog API dành cho công cụ import tin cậy: đọc danh mục/chi tiết sản phẩm,
upload ảnh và tạo sản phẩm **nháp**. API không cập nhật, xóa hoặc publish sản
phẩm; owner kiểm tra và publish trong admin. API cũng không tạo danh mục, không
nhận URL ảnh bên ngoài và không tải ảnh từ URL do client cung cấp.

## Xác thực và phạm vi

Gửi `Authorization: Bearer <token>` trên mọi endpoint dưới đây. Cookie Better
Auth, mật khẩu admin và token trong query string không thay thế bearer header.
Token gắn với một user đang có role `owner` và chưa bị ban; đổi role hoặc ban
owner làm token mất quyền. Hết hạn hoặc thu hồi token có hiệu lực ở request
sau và được kiểm tra lại trong transaction mutation.

CLI cấp token ngẫu nhiên, chỉ lưu SHA-256 trong database. Bearer được ghi một
lần vào file JSON `{id, token, expiresAt}` mới, mode `0600`; file đã tồn tại bị
từ chối, không in bearer ra stdout. `--days` nhận 1–90, mặc định 30; tên token
sau trim dài 1–100 ký tự. Nếu bỏ `--scopes`, CLI cấp cả ba scope; chỉ định
tường minh các scopes tối thiểu cần dùng:

| Scope | Quyền |
|---|---|
| `catalog:read` | Đọc danh mục và mọi sản phẩm theo ID, gồm nháp và sản phẩm do admin/token khác tạo |
| `products:create` | Validate payload và tạo sản phẩm `DRAFT` |
| `images:write` | Upload ảnh, nhận asset thuộc token đó |

Hệ thống không có tenant. Quyền đọc không giới hạn theo owner/token; chỉ quyền
tham chiếu asset trong payload bị giới hạn theo token. Không thể dùng token mới
để tham chiếu asset của token cũ.

Production bắt buộc HTTPS. App tin `X-Forwarded-Proto` do reverse proxy đặt;
origin chỉ được bind loopback sau proxy tin cậy. Không đưa bearer vào source,
log, shell history, chat hoặc báo cáo. Vận hành container xem
[runbook](08-production-runbook.md).

## Endpoint và response

| Method / path | Scope | Body / query | Thành công |
|---|---|---|---|
| `GET /api/admin/categories` | `catalog:read` | `limit` 1–200, mặc định 100; `cursor` tùy chọn, 1–100 ký tự | `200`, `data` là danh sách `{id,name,slug,parentId}`, `nextCursor` là ID cuối hoặc `null` |
| `POST /api/admin/images` | `images:write` | Byte ảnh thô, MIME chính xác, `Idempotency-Key` bắt buộc | `201` lần đầu / `200` replay; `data: {id,url,bytes,expiresAt}`, `replayed` |
| `POST /api/admin/products/validate` | `products:create` | JSON product payload | `200`, `data: {valid:true,product:<payload đã normalize>}` |
| `POST /api/admin/products` | `products:create` | JSON product payload, `Idempotency-Key` bắt buộc | `201` lần đầu / `200` replay; `data` product cùng variants/imageSets/images, `replayed` |
| `GET /api/admin/products/:id` | `catalog:read` | ID 1–100 ký tự | `200`, `data` product hiện tại cùng variants/imageSets/images |

Mọi response có `requestId`, header `X-Request-Id` và `Cache-Control: no-store`.
Response lỗi có dạng:

```json
{"error":{"code":"INVALID_CATEGORY","message":"Category does not exist"},"requestId":"..."}
```

Lỗi schema thêm `error.issues`, mỗi phần tử có `path` và `code`. Log chỉ ghi
request ID, token ID nếu đã xác thực, operation, resource ID khi có, HTTP status
và error code;
không ghi Authorization hoặc body.

Danh mục sắp theo ID tăng dần. Lặp GET với `cursor=nextCursor` cho đến khi
`nextCursor=null`; cursor chọn các ID lớn hơn giá trị gửi lên. Validate không
tạo product, asset, audit mutation hay idempotency record, nhưng vẫn tính rate
limit và cập nhật thời điểm dùng token. Kết quả validate là kiểm tra tại thời
điểm gọi, không đặt chỗ SKU/asset; create kiểm tra lại trong transaction và
trả `422 INVALID_ASSET` nếu file biến mất trước lúc tham chiếu được ghi.

Admin có thể bỏ ảnh trong form và Hủy an toàn vì ProductImage đã lưu chỉ đổi
khi bấm Lưu. Lưu enqueue cleanup cho URL đã bị gỡ trong cùng transaction với
thay đổi product; worker khóa URL rồi kiểm tra lại mọi ProductImage trước khi
xóa. Cleanup job xóa `CatalogApiAsset` sau khi file bị xóa hoặc đã vắng mặt,
nhưng giữ `CatalogApiRequest` để lần replay upload cũ trả `410 ASSET_EXPIRED`.
Xóa toàn bộ sản phẩm hiện không enqueue cleanup ảnh.

## Giới hạn request và ảnh

- 60 request/phút/token trong cửa sổ phút của server, tính cả validate và replay.
  Khi hết hạn mức, `429` có `Retry-After: 60`.
- Tối đa 10.000 sản phẩm tạo thành công/token trong vòng đời; replay không tính
  thêm. Đây không phải quota có thể reset bằng cách xóa sản phẩm.
- JSON dùng `Content-Type: application/json`, tối đa 256 KiB. Không chấp nhận
  `Content-Encoding`; body có giới hạn thời gian đọc 15 giây.
- Upload ảnh dùng body nhị phân, **không multipart/base64**. `Content-Type` phải
  chính xác là `image/jpeg`, `image/png` hoặc `image/webp`, khớp định dạng giải mã.
- Byte đầu vào và WebP đầu ra đều tối đa 5 MiB; tối đa 16.000.000 pixel, mỗi
  chiều không quá 8192 pixel, đúng một frame. Ảnh hỏng/animation bị từ chối.
- Server xoay theo orientation, mã hóa lại WebP và bỏ metadata. `bytes` trong
  response là dung lượng WebP, `id` là `assetId` dùng trong payload product.
- Tổng asset record của một token tối đa 250 MiB, gồm cả ảnh đã gắn và ảnh hết
  hạn chưa cleanup. Asset chưa gắn hết hạn sau 24 giờ. Sau khi admin lưu bỏ
  ảnh, worker xóa asset và thu hồi quota nếu không còn product image nào tham
  chiếu. Asset đang được sản phẩm khác dùng vẫn được giữ.

URL upload là đường dẫn public để hiển thị ảnh; việc product còn `DRAFT` không
làm file ảnh trở thành nội dung riêng tư. Chỉ upload ảnh sản phẩm được phép
công khai. Cleanup asset hết hạn/crash-orphan là lệnh vận hành riêng; gợi ý
dọn ảnh admin chạy qua worker. Xem runbook. Lệnh maintenance cũng dọn file
`catalog-<uuid>.webp` cũ hơn 24 giờ không còn asset/product image tham
chiếu, giữ nguyên file recent và file legacy/admin không mang prefix này.

## Payload product

Mọi object là strict: field lạ bị từ chối. Không gửi `id`, `slug`, URL ảnh,
trạng thái publish hay dữ liệu cập nhật. Các số là JSON number nguyên,
không nhận chuỗi số. Giới hạn số nguyên chung là `0..2147483647`.

| Field | Bắt buộc / giới hạn |
|---|---|
| `product` | Object bắt buộc |
| `product.name` | String, trim, 1–200 ký tự |
| `product.description` | String tùy chọn, tối đa 10.000 ký tự; không nhận `null` |
| `product.categoryId` | String, trim, 1–100 ký tự; danh mục phải tồn tại |
| `product.basePrice` | Số nguyên VND trong giới hạn chung |
| `product.status` | Chỉ `DRAFT`, mặc định `DRAFT` nếu bỏ qua |
| `variants` | Mảng bắt buộc, 1–100 phần tử |
| `variants[].size` | String, trim, 1–40 ký tự |
| `variants[].color` | String, trim, 1–80 ký tự |
| `variants[].sku` | String, trim, 1–100 ký tự; unique trong payload và toàn catalog |
| `variants[].stock` | Số nguyên trong giới hạn chung |
| `variants[].priceOverride` | Tùy chọn, `null` hoặc số nguyên VND trong giới hạn chung; bỏ qua/`null` dùng base price |
| `imageSets` | Tùy chọn, mặc định `[]`, tối đa 20 bộ |
| `imageSets[].color` | String, trim, 1–80 ký tự, phải khớp màu của một variant |
| `imageSets[].position` | Số nguyên trong giới hạn chung |
| `imageSets[].isDefault` | Boolean bắt buộc |
| `imageSets[].images` | Mảng 1–10 ảnh |
| `imageSets[].images[].assetId` | String, trim, 1–100 ký tự; asset thuộc token, còn hạn hoặc đã gắn, file vẫn tồn tại |
| `imageSets[].images[].position` | Số nguyên trong giới hạn chung |

Cặp `(size,color)` phải unique trong sản phẩm. Mỗi màu có tối đa một bộ ảnh;
nếu có bộ ảnh thì phải có đúng một bộ `isDefault=true`. Sản phẩm không có ảnh
vẫn hợp lệ dưới dạng nháp. Slug được server sinh từ tên. Khi thành công,
response có ID/slug và URL ảnh đã được server ánh xạ; không gửi response này
nguyên dạng làm create payload.

## Idempotency và retry

`Idempotency-Key` bắt buộc cho upload/create: 1–128 ký tự thuộc tập
`A-Z a-z 0-9 . _ : -`. Chọn key ổn định cho từng ảnh/sản phẩm trong batch; giữ
manifest cục bộ gồm key, đường dẫn payload và ID resource trả về.

Record được lưu bền vững theo `(token, operation, key)`, không tự hết hạn.
Cùng key, cùng hash trả response đã lưu với `replayed=true`; cùng key nhưng
payload khác trả `409 IDEMPOTENCY_CONFLICT`. Hash product dựa trên JSON đã
parse, trim và điền default; thứ tự mảng vẫn có ý nghĩa. Hash ảnh gồm MIME và
byte gốc: ảnh nhìn giống nhau nhưng file khác vẫn là payload khác.

Dữ liệu, response idempotency và audit commit chung transaction dưới khóa token.
Nếu timeout/mất kết nối/`500`, retry **cùng token, key và payload** trước khi tạo
key mới. Một lần replay product trả snapshot lúc tạo; GET theo ID lấy dữ liệu
hiện tại. Với lỗi rate limit, đợi `Retry-After`; hết quota sản phẩm cần operator
xử lý, không retry liên tục. Lỗi validation trước commit không giữ key thành
công nên có thể sửa payload rồi thử lại.

Upload replay của asset chưa gắn đã hết hạn, đã cleanup hoặc thiếu file trả
`410 ASSET_EXPIRED`. Upload lại với **key mới** và dùng asset ID mới. Gắn ảnh
vào product không đặt lại thời hạn của bearer token. Key cũ của upload hết hạn
vẫn tồn tại, không thể dùng nó như một lần upload mới.

## Quy trình bằng file cục bộ

Các ví dụ yêu cầu `jq`, `curl`, database local đã migrate, một user owner và app
local đang chạy. Không dùng những lệnh này như smoke test production. Thay email,
category ID và ảnh bằng dữ liệu đã kiểm tra; `private_dir` nằm ngoài repository.

```bash
umask 077
private_dir=$(mktemp -d)
api_base=http://localhost:3000
npm run catalog:api -- issue \
  --owner-email owner@example.com --name supplier-import \
  --days 30 --scopes catalog:read,products:create,images:write \
  --out "$private_dir/token.json"
jq -r '"Authorization: Bearer " + .token' "$private_dir/token.json" \
  > "$private_dir/auth.header"

curl --silent --show-error --fail-with-body \
  --header @"$private_dir/auth.header" \
  "$api_base/api/admin/categories?limit=200" \
  --output "$private_dir/categories.json"
jq '.data, .nextCursor' "$private_dir/categories.json"
```

Nếu còn cursor, tải trang kế bằng `--get --data-urlencode "cursor=..."` cùng
`--data-urlencode "limit=200"`. Chọn ID danh mục từ response, không suy từ tên.
Upload một ảnh local và lưu toàn bộ response để lấy asset:

```bash
curl --silent --show-error --fail-with-body \
  --header @"$private_dir/auth.header" \
  --header 'Content-Type: image/jpeg' \
  --header 'Idempotency-Key: supplier-batch-001-image-001' \
  --data-binary @/absolute/path/product-black.jpg \
  "$api_base/api/admin/images" \
  --output "$private_dir/image-001.json"

category_id=REPLACE_WITH_CATEGORY_ID
jq -n --arg categoryId "$category_id" \
  --arg assetId "$(jq -r '.data.id' "$private_dir/image-001.json")" \
  '{product:{name:"Giày mẫu",description:"Mô tả sản phẩm",categoryId:$categoryId,basePrice:450000,status:"DRAFT"},
    variants:[{size:"40",color:"Đen",sku:"SUPPLIER-001-BLACK-40",stock:5,priceOverride:null}],
    imageSets:[{color:"Đen",position:0,isDefault:true,images:[{assetId:$assetId,position:0}]}]}' \
  > "$private_dir/product-001.json"

curl --silent --show-error --fail-with-body \
  --header @"$private_dir/auth.header" --header 'Content-Type: application/json' \
  --data-binary @"$private_dir/product-001.json" \
  "$api_base/api/admin/products/validate" \
  --output "$private_dir/validation-001.json"
jq . "$private_dir/validation-001.json"
```

Chỉ create khi validate thành công; giữ nguyên file và key khi retry:

```bash
curl --silent --show-error --fail-with-body \
  --header @"$private_dir/auth.header" --header 'Content-Type: application/json' \
  --header 'Idempotency-Key: supplier-batch-001-product-001' \
  --data-binary @"$private_dir/product-001.json" \
  "$api_base/api/admin/products" \
  --output "$private_dir/created-001.json"

product_id=$(jq -r '.data.id' "$private_dir/created-001.json")
curl --silent --show-error --fail-with-body \
  --header @"$private_dir/auth.header" \
  "$api_base/api/admin/products/$product_id" \
  --output "$private_dir/product-current-001.json"
jq '.data | {id,slug,status,variants,imageSets}' "$private_dir/product-current-001.json"

npm run catalog:api -- list
npm run catalog:api -- revoke --id "$(jq -r '.id' "$private_dir/token.json")"
```

Kiểm tra nháp trong admin trước khi publish. Lưu manifest/result cần đối soát ở
nơi private; sau khi thu hồi, xóa `token.json` và `auth.header` khi không còn cần.
Không bật shell tracing hoặc curl verbose cho workflow có bearer header.

## Mã lỗi

| HTTP | Code | Xử lý |
|---|---|---|
| `400` | `HTTPS_REQUIRED` | Dùng HTTPS và kiểm tra trusted proxy |
| `400` | `INVALID_JSON`, `INVALID_BODY`, `INVALID_IDEMPOTENCY_KEY` | Sửa JSON/body/key |
| `401` | `UNAUTHORIZED` | Thiếu/sai bearer, token hết hạn hoặc đã thu hồi; response có `WWW-Authenticate: Bearer` |
| `403` | `FORBIDDEN` | Thiếu scope hoặc owner không còn quyền |
| `404` | `NOT_FOUND` | Product ID không tồn tại |
| `408` | `BODY_TIMEOUT` | Gửi lại body trong giới hạn thời gian |
| `409` | `IDEMPOTENCY_CONFLICT` | Đối chiếu manifest; chỉ dùng key mới cho mutation mới |
| `409` | `SKU_CONFLICT`, `CATALOG_CONFLICT` | Đối chiếu SKU/cặp size-màu/slug và validate lại |
| `410` | `ASSET_EXPIRED` | Upload ảnh bằng key mới |
| `413` | `BODY_TOO_LARGE`, `IMAGE_TOO_LARGE` | Giảm byte/kích thước/pixel |
| `413` | `STORAGE_QUOTA_EXCEEDED` | Cleanup ảnh chưa gắn hết hạn hoặc yêu cầu operator xử lý dung lượng |
| `415` | `UNSUPPORTED_MEDIA_TYPE`, `UNSUPPORTED_ENCODING`, `INVALID_IMAGE` | Sửa MIME, bỏ encoding hoặc chuyển sang ảnh hợp lệ |
| `422` | `VALIDATION_ERROR`, `INVALID_CATEGORY`, `INVALID_ASSET`, `INVALID_REFERENCE` | Sửa field/tham chiếu; asset phải thuộc đúng token |
| `429` | `RATE_LIMITED`, `PRODUCT_QUOTA` | Chờ cửa sổ rate limit hoặc xử lý quota vòng đời |
| `500` | `INTERNAL_ERROR`, `INVALID_ASSET_PATH` | Giữ request ID, đối soát và retry cùng key; operator kiểm tra log/storage |

Các method không được cung cấp do framework xử lý, không thuộc error envelope
ở trên. Không suy rằng validate thành công bảo đảm mutation sau đó thành công.
