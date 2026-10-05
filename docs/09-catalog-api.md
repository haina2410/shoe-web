# 09 — Catalog API

Catalog API dành cho công cụ AI/import tin cậy: đọc/tìm kiếm catalog, upload
ảnh, tạo sản phẩm **nháp**, cập nhật/publish/archive/xóa sản phẩm, tạo/sửa/xóa
biến thể và quản lý danh mục phẳng. Mọi mutation có scope riêng, idempotency
và audit. API chỉ nhận asset ảnh đã upload, không tải ảnh từ URL bên ngoài.

## Xác thực và phạm vi

Gửi `Authorization: Bearer <token>` trên mọi endpoint dưới đây. Cookie Better
Auth, mật khẩu admin và token trong query string không thay thế bearer header.
Token gắn với một user đang có role `owner` và chưa bị ban; đổi role hoặc ban
owner làm token mất quyền. Hết hạn hoặc thu hồi token có hiệu lực ở request
sau và được kiểm tra lại trong transaction mutation.

CLI cấp token ngẫu nhiên, chỉ lưu SHA-256 trong database. Bearer được ghi một
lần vào file JSON `{id, token, expiresAt}` mới, mode `0600`; file đã tồn tại bị
từ chối, không in bearer ra stdout. `--days` nhận 1–90, mặc định 30; tên token
sau trim dài 1–100 ký tự. Nếu bỏ `--scopes`, CLI cấp toàn bộ scope; chỉ định
tường minh các scopes tối thiểu cần dùng:

| Scope | Quyền |
|---|---|
| `catalog:read` | Đọc danh mục, tìm kiếm và đọc mọi sản phẩm theo ID, gồm nháp và sản phẩm do admin/token khác tạo |
| `products:create` | Validate payload và tạo sản phẩm `DRAFT` |
| `images:write` | Upload ảnh, nhận asset thuộc token đó |
| `products:update` | Cập nhật field sản phẩm, publish/archive và thay bộ ảnh |
| `variants:create` | Thêm biến thể vào sản phẩm hiện có |
| `variants:update` | Sửa field biến thể và tồn kho với `expectedStock` |
| `variants:delete` | Xóa biến thể chưa được đơn hàng tham chiếu |
| `products:delete` | Xóa sản phẩm chưa được đơn hàng tham chiếu |
| `categories:create` | Tạo danh mục phẳng |
| `categories:update` | Đổi tên danh mục |
| `categories:delete` | Xóa danh mục không có sản phẩm/danh mục con |

Hệ thống không có tenant. Quyền đọc không giới hạn theo owner/token; chỉ quyền
tham chiếu asset trong payload bị giới hạn theo token. Không thể dùng token mới
để tham chiếu asset của token cũ. Token cũ không tự nhận scope mới: cấp token
mới với các scope mutation cần dùng. Bỏ `imageSets` khi PATCH
sẽ giữ nguyên ảnh hiện tại, kể cả ảnh thuộc token khác.

Production bắt buộc HTTPS. App tin `X-Forwarded-Proto` do reverse proxy đặt;
origin chỉ được bind loopback sau proxy tin cậy. Không đưa bearer vào source,
log, shell history, chat hoặc báo cáo. Vận hành container xem
[runbook](08-production-runbook.md).

## Endpoint và response

| Method / path | Scope | Body / query | Thành công |
|---|---|---|---|
| `GET /api/admin/categories` | `catalog:read` | `limit` 1–200, mặc định 100; `cursor` tùy chọn, 1–100 ký tự | `200`, `data` là danh sách `{id,name,slug,parentId}`, `nextCursor` là ID cuối hoặc `null` |
| `POST /api/admin/images` | `images:write` | Byte ảnh thô, MIME chính xác, `Idempotency-Key` bắt buộc | `201` lần đầu / `200` replay; `data: {id,url,bytes,expiresAt}`, `replayed` |
| `GET /api/admin/products` | `catalog:read` | `limit` 1–100, mặc định 50; `cursor`, `q`, `sku`, `categoryId`, `status` tùy chọn | `200`, `data` danh sách product cùng variants/imageSets/images, `nextCursor` |
| `POST /api/admin/products/validate` | `products:create` | JSON product payload | `200`, `data: {valid:true,product:<payload đã normalize>}` |
| `POST /api/admin/products` | `products:create` | JSON product payload, `Idempotency-Key` bắt buộc | `201` lần đầu / `200` replay; `data` product cùng variants/imageSets/images, `replayed` |
| `PATCH /api/admin/products/:id` | `products:update` | JSON update payload, `Idempotency-Key` bắt buộc | `200`, `data` product hiện tại cùng variants/imageSets/images, `replayed` |
| `POST /api/admin/products/:id/variants` | `variants:create` | JSON variant payload, `Idempotency-Key` bắt buộc | `201` lần đầu / `200` replay; `data` variant mới, `replayed` |
| `GET /api/admin/products/:id` | `catalog:read` | ID 1–100 ký tự | `200`, `data` product hiện tại cùng variants/imageSets/images |
| `PATCH /api/admin/products/:id/variants/:variantId` | `variants:update` | JSON variant update, `Idempotency-Key` bắt buộc | `200`, `data` variant hiện tại, `replayed` |
| `DELETE /api/admin/products/:id/variants/:variantId` | `variants:delete` | Không body, `Idempotency-Key` bắt buộc | `200`, `data: {id,productId,deleted:true}`, `replayed` |
| `DELETE /api/admin/products/:id` | `products:delete` | Không body, `Idempotency-Key` bắt buộc | `200`, `data: {id,deleted:true}`, `replayed` |
| `POST /api/admin/categories` | `categories:create` | JSON `{name}`, `Idempotency-Key` bắt buộc | `201` lần đầu / `200` replay, `data: {id,name,slug,parentId}`, `replayed` |
| `PATCH /api/admin/categories/:id` | `categories:update` | JSON `{name}`, `Idempotency-Key` bắt buộc | `200`, `data: {id,name,slug,parentId}`, `replayed` |
| `DELETE /api/admin/categories/:id` | `categories:delete` | Không body, `Idempotency-Key` bắt buộc | `200`, `data: {id,deleted:true}`, `replayed` |

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
Xóa sản phẩm qua catalog API enqueue cleanup cho mọi URL ảnh local hợp lệ;
đường xóa qua admin form hiện vẫn không enqueue cleanup ảnh.

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

Mọi object là strict: field lạ bị từ chối. Payload **create** không gửi `id`, `slug`, URL ảnh,
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

## Cập nhật sản phẩm và thêm biến thể

`PATCH /api/admin/products/:id` nhận object strict với `product` và/hoặc
`imageSets`. Payload rỗng hoặc `product:{}` bị từ chối. Field bỏ qua giữ nguyên;
API không thay slug khi đổi tên, không sửa/xóa hoặc tạo lại variants.

| Field cập nhật | Giới hạn / ý nghĩa |
|---|---|
| `product.name` | Như create; cập nhật cả tên tìm kiếm không dấu |
| `product.description` | String tối đa 10.000 ký tự hoặc `null` để xóa mô tả |
| `product.categoryId` | Như create; danh mục phải tồn tại |
| `product.basePrice` | Số nguyên VND `0..2147483647` |
| `product.status` | `DRAFT`, `ACTIVE` (publish) hoặc `ARCHIVED`; bỏ qua giữ nguyên |
| `imageSets` | Như create; thay **toàn bộ** bộ ảnh, `[]` xóa hết ảnh; bỏ qua giữ nguyên |

Màu bộ ảnh phải thuộc variant hiện có. Asset mới phải thuộc token gọi PATCH;
không chấp nhận URL hoặc ID ảnh từ GET thay cho `assetId`. Tạo variant màu mới
trước khi thêm bộ ảnh cho màu đó. Sản phẩm `ACTIVE` có thể không có ảnh, giống
quy tắc admin; client nên kiểm tra sản phẩm trước khi publish.

`POST /api/admin/products/:id/variants` nhận **một object variant** trực tiếp,
không bọc trong `variants`: `{size,color,sku,stock,priceOverride?}`. Giới hạn
field như bảng create; SKU unique toàn catalog, cặp size/màu unique trong sản
phẩm. Tối đa 100 variants/sản phẩm khi thêm qua API. Các variants cũ giữ nguyên
ID, stock và tham chiếu đơn hàng. Endpoint không tạo product hay bộ ảnh.

```json
{"product":{"name":"Giày mẫu mới","basePrice":490000,"status":"ACTIVE"}}
```

```json
{"size":"41","color":"Đen","sku":"SUPPLIER-001-BLACK-41","stock":5,"priceOverride":null}
```

Gọi endpoint bằng file cục bộ (biến auth/API/ID như ví dụ phía dưới):

```bash
curl --silent --show-error --fail-with-body \
  --header @"$private_dir/auth.header" --header 'Content-Type: application/json' \
  --header 'Idempotency-Key: supplier-001-update-001' \
  --data-binary @"$private_dir/product-update.json" \
  --request PATCH "$api_base/api/admin/products/$product_id" \
  --output "$private_dir/updated-001.json"

curl --silent --show-error --fail-with-body \
  --header @"$private_dir/auth.header" --header 'Content-Type: application/json' \
  --header 'Idempotency-Key: supplier-001-variant-41' \
  --data-binary @"$private_dir/variant-41.json" \
  "$api_base/api/admin/products/$product_id/variants" \
  --output "$private_dir/variant-created-41.json"
```

Mutation cập nhật khóa product sau khóa token. Khi thay bộ ảnh, server so URL
cũ/mới và enqueue một job cho từng URL bị bỏ ngay trong transaction cập nhật,
idempotency và audit. Enqueue lỗi rollback mọi thay đổi. Replay không enqueue
lại. Worker dùng cùng uploads volume với app, chỉ xóa file local hợp lệ, kiểm
tra lại mọi `ProductImage` trước khi xóa và giữ file còn được sản phẩm khác
tham chiếu (kể cả ảnh vừa được gắn lại). Asset catalog được khóa theo token rồi
URL bằng advisory lock, dùng chung quy tắc với admin để không đua với reuse;
khi không còn tham chiếu, worker xóa file và asset record,
thu hồi storage quota. File đã mất được coi là đã dọn; lỗi filesystem khác
được retry theo cấu hình pg-boss. Record idempotency upload vẫn giữ nguyên;
replay upload sau cleanup trả `410 ASSET_EXPIRED`.

## Tìm kiếm sản phẩm

`GET /api/admin/products` đọc mọi trạng thái, kể cả nháp và sản phẩm do token
khác tạo. Sắp theo ID tăng dần; phân trang bằng `cursor=nextCursor` với cùng
bộ filter cho đến khi `nextCursor=null`. Query strict, field lạ bị từ chối.

| Query | Quy tắc |
|---|---|
| `limit` | Số nguyên 1–100, mặc định 50 |
| `cursor` | ID 1–100 ký tự; lấy các ID lớn hơn cursor |
| `q` | Trim, 1–200 ký tự; tìm tên không dấu, tên gốc, slug hoặc một phần SKU; không phân biệt hoa/thường |
| `sku` | Trim, 1–100 ký tự; khớp SKU chính xác, phân biệt hoa/thường |
| `categoryId` | Trim, 1–100 ký tự; lọc danh mục |
| `status` | `DRAFT`, `ACTIVE` hoặc `ARCHIVED`; bỏ qua đọc cả ba |

Các filter kết hợp AND. `data` có cùng dạng như GET product theo ID, bao gồm
mọi variants và bộ ảnh của sản phẩm khớp. Search không ghi audit mutation.

## Sửa và xóa biến thể

`PATCH /api/admin/products/:id/variants/:variantId` nhận một object strict với
ít nhất một field trong `size`, `color`, `sku`, `stock`, `priceOverride`. Field
bỏ qua giữ nguyên; giới hạn như create variant. `priceOverride:null` trở về giá
base của product. ID phải thuộc đúng product trong URL.

Khi có `stock`, bắt buộc gửi thêm `expectedStock` (số nguyên `0..2147483647`);
hai field phải đi cùng nhau. Server cập nhật tồn kho bằng điều kiện so sánh
trực tiếp trong DB. Nếu tồn kho đã đổi, toàn bộ PATCH rollback và trả
`409 STALE_STOCK`; GET lại product và dùng key mới cho payload đã sửa. PATCH
metadata không ghi tồn kho. SKU và cặp size/màu vẫn phải unique; sửa một
variant không thay ID hoặc snapshot size/màu/giá trong đơn hàng đã tạo.

```json
{"stock":12,"expectedStock":5,"priceOverride":null}
```

DELETE variant chỉ thành công nếu không có `OrderItem` tham chiếu và còn ít
nhất một variant khác trong product. Mọi trạng thái đơn hàng đều giữ tham
chiếu, kể cả đơn hủy/hết hạn. Variant đã dùng trong đơn có thể cập nhật stock
về 0; xóa variant cuối trả `409 LAST_VARIANT`.

Đổi màu hoặc xóa variant cuối của một màu tự gỡ bộ ảnh màu đó và enqueue
cleanup trong cùng transaction. Nếu bộ vừa gỡ là default, bộ còn lại có
`position` nhỏ nhất (tie theo ID) trở thành default. Ảnh giữ nguyên khi vẫn
còn variant dùng màu cũ. Replay không enqueue lại; lỗi enqueue rollback cả
variant, bộ ảnh, idempotency và audit. Worker giữ file còn được sản phẩm hoặc
bộ ảnh khác tham chiếu. Product `updatedAt` thay đổi khi sửa/xóa variant.

## Xóa sản phẩm và quản lý danh mục

`DELETE /api/admin/products/:id` xóa product, variants và bộ ảnh cùng
transaction, enqueue một job cho mỗi URL local hợp lệ duy nhất. Có bất kỳ
variant nào được đơn hàng tham chiếu thì trả `409 PRODUCT_IN_USE`, không xóa
dữ liệu hay enqueue. Có thể archive sản phẩm qua PATCH để ẩn khỏi storefront.

Category create/PATCH nhận object strict `{name}`; trim, 1–80 ký tự. Create
sinh slug unique từ tên, `parentId:null`; PATCH chỉ đổi tên và giữ slug để link
storefront ổn định. Cấu trúc phẳng theo admin hiện tại; không nhận `slug` hay
`parentId`. Category DELETE chỉ xóa danh mục rỗng; sản phẩm hoặc danh mục con
còn tham chiếu trả `409 CATEGORY_IN_USE`.

Mọi DELETE không có body, dùng ID trong URL và `Idempotency-Key`. Body không
rỗng trả `400 INVALID_BODY`. Lần đầu và replay đều trả `200` với snapshot
`deleted:true`; replay cùng key vẫn thành công sau khi resource đã bị xóa.
ID không tồn tại với key mới trả `404 NOT_FOUND`.

```bash
curl --silent --show-error --fail-with-body \
  --header @"$private_dir/auth.header" --header 'Content-Type: application/json' \
  --header 'Idempotency-Key: supplier-001-stock-001' \
  --data-binary @"$private_dir/variant-update.json" \
  --request PATCH "$api_base/api/admin/products/$product_id/variants/$variant_id" \
  --output "$private_dir/variant-updated.json"

curl --silent --show-error --fail-with-body \
  --header @"$private_dir/auth.header" \
  --header 'Idempotency-Key: supplier-001-variant-delete-001' \
  --request DELETE "$api_base/api/admin/products/$product_id/variants/$variant_id" \
  --output "$private_dir/variant-deleted.json"
```

## Idempotency và retry

`Idempotency-Key` bắt buộc cho mọi mutation (upload, POST create, PATCH, DELETE):
1–128 ký tự thuộc tập
`A-Z a-z 0-9 . _ : -`. Chọn key ổn định cho từng ảnh/sản phẩm trong batch; giữ
manifest cục bộ gồm key, đường dẫn payload và ID resource trả về.

Record được lưu bền vững theo `(token, operation, key)`, không tự hết hạn.
Cùng key, cùng hash trả response đã lưu với `replayed=true`; cùng key nhưng
payload khác trả `409 IDEMPOTENCY_CONFLICT`. Hash mutation gồm ID resource đích,
với variant gồm cả product ID và variant ID: không tái dùng cùng key cho
resource khác trong cùng operation. Hash product dựa trên JSON đã
parse, trim và điền default; thứ tự mảng vẫn có ý nghĩa. Hash ảnh gồm MIME và
byte gốc: ảnh nhìn giống nhau nhưng file khác vẫn là payload khác.

Dữ liệu, response idempotency và audit commit chung transaction dưới khóa token.
Nếu timeout/mất kết nối/`500`, retry **cùng token, key và payload** trước khi tạo
key mới. Một lần replay mutation trả snapshot lúc commit; GET theo ID lấy dữ liệu
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
  --days 30 --scopes catalog:read,products:create,products:update,products:delete,variants:create,variants:update,variants:delete,categories:create,categories:update,categories:delete,images:write \
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

Kiểm tra nháp trước khi publish qua admin hoặc PATCH với `products:update`. Lưu manifest/result cần đối soát ở
nơi private; sau khi thu hồi, xóa `token.json` và `auth.header` khi không còn cần.
Không bật shell tracing hoặc curl verbose cho workflow có bearer header.

## Mã lỗi

| HTTP | Code | Xử lý |
|---|---|---|
| `400` | `HTTPS_REQUIRED` | Dùng HTTPS và kiểm tra trusted proxy |
| `400` | `INVALID_JSON`, `INVALID_BODY`, `INVALID_IDEMPOTENCY_KEY` | Sửa JSON/body/key |
| `401` | `UNAUTHORIZED` | Thiếu/sai bearer, token hết hạn hoặc đã thu hồi; response có `WWW-Authenticate: Bearer` |
| `403` | `FORBIDDEN` | Thiếu scope hoặc owner không còn quyền |
| `404` | `NOT_FOUND` | Product, variant hoặc category không tồn tại; variant phải thuộc product trong URL |
| `408` | `BODY_TIMEOUT` | Gửi lại body trong giới hạn thời gian |
| `409` | `IDEMPOTENCY_CONFLICT` | Đối chiếu manifest; chỉ dùng key mới cho mutation mới |
| `409` | `STALE_STOCK` | GET lại stock và dùng key mới với `expectedStock` hiện tại |
| `409` | `VARIANT_IN_USE`, `PRODUCT_IN_USE` | Giữ record có đơn hàng tham chiếu; stock 0 hoặc archive |
| `409` | `LAST_VARIANT` | Product phải giữ ít nhất một variant; dùng DELETE product nếu cần xóa toàn bộ |
| `409` | `CATEGORY_IN_USE` | Chuyển/xóa sản phẩm và danh mục con trước |
| `409` | `SKU_CONFLICT`, `CATALOG_CONFLICT` | Đối chiếu SKU/cặp size-màu/slug và validate lại |
| `410` | `ASSET_EXPIRED` | Upload ảnh bằng key mới |
| `413` | `BODY_TOO_LARGE`, `IMAGE_TOO_LARGE` | Giảm byte/kích thước/pixel |
| `413` | `STORAGE_QUOTA_EXCEEDED` | Cleanup ảnh chưa gắn hết hạn hoặc yêu cầu operator xử lý dung lượng |
| `415` | `UNSUPPORTED_MEDIA_TYPE`, `UNSUPPORTED_ENCODING`, `INVALID_IMAGE` | Sửa MIME, bỏ encoding hoặc chuyển sang ảnh hợp lệ |
| `422` | `VALIDATION_ERROR`, `INVALID_CATEGORY`, `INVALID_ASSET`, `INVALID_REFERENCE`, `VARIANT_LIMIT` | Sửa field/tham chiếu; asset phải thuộc đúng token |
| `429` | `RATE_LIMITED`, `PRODUCT_QUOTA` | Chờ cửa sổ rate limit hoặc xử lý quota vòng đời |
| `500` | `INTERNAL_ERROR`, `INVALID_ASSET_PATH` | Giữ request ID, đối soát và retry cùng key; operator kiểm tra log/storage |

Các method không được cung cấp do framework xử lý, không thuộc error envelope
ở trên. Không suy rằng validate thành công bảo đảm mutation sau đó thành công.

## Kiểm thử tự động

Vitest integration tests ở `src/server/catalog-api/` chạy với PostgreSQL thật
qua `DATABASE_URL_TEST`, gồm HTTP routes, bearer/scopes, idempotency/audit,
stock và deletion concurrency, tham chiếu đơn hàng, upload và worker cleanup
ảnh. `management-routes.integration.test.ts` bao phủ product search/delete,
variant PATCH/DELETE và category mutations; `image-cleanup.integration.test.ts`
kiểm tra queue, filesystem và rollback khi enqueue lỗi.

```bash
npm test -- src/server/catalog-api
```

Suite này chạy local trên DB test; `npm run test:smoke` của deployment hiện
kiểm tra health/storefront/login/admin redirect và không chạy mutation catalog.
