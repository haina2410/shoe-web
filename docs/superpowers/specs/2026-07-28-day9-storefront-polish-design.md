# Ngày 9 — Storefront polish, accessibility và nội dung thương hiệu

Ngày: 2026-07-28  
Trạng thái: đã được người dùng duyệt trong brainstorming

## 1. Mục tiêu

Ngày 9 biến storefront đang đủ chức năng thành một demo ecommerce chỉn chu,
đáng tin và dùng tốt trên mobile lẫn desktop. Công việc tập trung vào visual
hierarchy, responsive, accessibility, empty/error states và nội dung thương
hiệu; không mở rộng nghiệp vụ thanh toán hoặc khuyến mãi.

Hướng được chọn là **curated storefront**:

1. navbar có logo, tìm kiếm và giỏ hàng;
2. banner thương hiệu tĩnh;
3. ba lối vào danh mục;
4. sản phẩm mới/nổi bật;
5. trust strip;
6. footer doanh nghiệp.

## 2. Nguyên tắc thiết kế

- Tuân thủ `docs/05-design-direction.md`: minimal retail, product-forward,
  nhiều khoảng trắng, paper/ink/evergreen/sage và motif gân lá tiết chế.
- Không dùng carousel, gradient loè, shadow nặng hoặc motion phô trương.
- Không hiển thị giảm giá, giá gạch ngang, countdown hoặc số liệu bán hàng
  không có nguồn dữ liệu thật.
- Copy tiếng Việt ngắn, chủ động và hướng người dùng tới bước tiếp theo.
- Storefront được polish sâu; admin chỉ được chuẩn hoá đủ cho demo, không
  redesign thành dashboard của doanh nghiệp lớn.

## 3. Public shell

### 3.1 Brand mark

Tạo một component brand dùng chung cho navbar và footer:

- biểu tượng lá SVG tạm;
- wordmark `leafshoes`;
- có accessible name phù hợp;
- asset/component có ranh giới rõ để thay bằng logo thật sau này mà không đổi
  layout hoặc call site.

Không cắt logo từ ảnh danh thiếp vì nguồn nhỏ, mờ và có nền.

### 3.2 Navbar

- Sticky ở đầu viewport, nền paper và hairline border.
- Desktop gồm logo, link Sản phẩm, search và giỏ hàng có tổng số lượng.
- Search submit bằng GET tới `/products?q=<query>`; không tạo search API mới.
- Mobile giữ logo và cart dễ chạm, đồng thời bố trí search/navigation gọn,
  không thu nhỏ nguyên desktop nav.
- Mọi link/button/input có focus-visible rõ và target cảm ứng đủ lớn.

Cart count là client island đọc Zustand đã hydrate; phần còn lại của header
không cần trở thành một client component lớn.

### 3.3 Footer

Footer dùng logo/wordmark chung và hiển thị:

- `CÔNG TY TNHH LEAFSHOES VIỆT NAM`;
- `Sản xuất giày dép, phụ liệu dép`;
- số điện thoại hiển thị `0395.069.089`, link `tel:0395069089`;
- email `leafshoes.vn@gmail.com`, link `mailto:leafshoes.vn@gmail.com`;
- `Số 14, Đường Phú Sơn 3, Xã Bình Minh, TP. Đồng Nai`;
- link Sản phẩm và Giỏ hàng;
- hỗ trợ Zalo bằng số `0395069089`.

Không hiển thị tên hoặc chức danh cá nhân trên danh thiếp. Thông tin doanh
nghiệp được khai báo ở một module/component dùng chung, không copy thành các
chuỗi rời trên nhiều trang.

## 4. Homepage

### 4.1 Banner tĩnh

- Heading giữ cụm `Bước êm cùng leafshoes` để không phá contract E2E hiện tại.
- Copy phụ mô tả sản phẩm cho nhịp sống mỗi ngày.
- CTA `Khám phá sản phẩm` dẫn tới `/products`.
- Dùng một ảnh giày AI tạm thời theo phong cách studio tối giản xanh–trắng.
- Ảnh không chứa text, giá hoặc claim; copy nằm trong HTML để responsive và
  accessible.
- Asset đặt dưới `public/brand/` và được tham chiếu qua một đường dẫn ổn định,
  để thay ảnh thật sau này mà không đổi component.
- Banner không tự chạy và không có slide/dot/carousel controls.

### 4.2 Danh mục

Ba tile/link:

- Sneaker → `/products?categorySlug=giay-sneaker`;
- Chạy bộ → `/products?categorySlug=giay-chay-bo`;
- Sandal → `/products?categorySlug=giay-sandal`.

Tile dùng typography, motif lá và surface color; không cần thêm ba ảnh category
riêng trong Ngày 9.

### 4.3 Sản phẩm mới

- Dùng query sản phẩm đang có và thứ tự mới nhất; không thêm `featured` flag.
- Giữ CTA xem toàn bộ sản phẩm.
- Product card được chuẩn hoá aspect ratio, typography, giá, stock/new state
  có dữ liệu thật, hover/focus và fallback ảnh.
- Không render sale badge vì schema không có discount.

### 4.4 Trust strip

Ba thông điệp đúng khả năng hiện tại:

- Thanh toán VietQR;
- Giao hàng toàn quốc;
- Hỗ trợ qua Zalo.

Các item là nội dung hỗ trợ quyết định mua, không phải claim marketing không
thể kiểm chứng.

## 5. Polish các route storefront

Polish sâu các route:

- `/`, `/products`, `/products/[slug]`;
- `/cart`, `/checkout`, `/orders/[orderCode]`;
- `/login`;
- header/footer dùng chung.

Chuẩn hoá:

- page width, spacing và type hierarchy;
- image ratio và fallback;
- button/input/select/textarea/focus states;
- status badge, summary card và divider;
- mobile stacking và desktop columns;
- loading/hydration placeholders không gây layout shift lớn;
- empty/error states có CTA tiếp theo.

Trang admin chỉ chuẩn hoá navigation, spacing, form, table overflow, action
buttons, status badges và empty states. Không thêm biểu đồ hoặc module quản trị
mới.

## 6. Accessibility và motion

- Thêm skip link tới nội dung chính và `id` ổn định trên main landmark.
- Dùng đúng heading hierarchy, `header`, `nav`, `main`, `footer`.
- Alt mô tả cho ảnh sản phẩm/banner; SVG/motif trang trí bị ẩn khỏi screen
  reader.
- Error message dùng text rõ và semantic phù hợp, không chỉ đổi màu.
- Focus-visible đủ tương phản trên mọi interactive element.
- Touch target chính tối thiểu khoảng 44px trên mobile.
- Hover transform/reveal được tắt hoặc giảm khi
  `prefers-reduced-motion: reduce`.
- Không tự động chuyển nội dung hoặc focus.

## 7. Asset và seed

- Tạo logo SVG tạm và banner AI tạm dưới `public/brand/`.
- Bổ sung file ảnh thực sự tồn tại cho các URL `/products/*.jpg` đang được
  seed tham chiếu; không để storefront demo render broken image.
- Các asset tạm không chứa logo thương hiệu khác, text, giá hoặc claim.
- Khi chủ cửa hàng cung cấp logo/ảnh thật, thay file hoặc mapping asset mà
  không cần migration.

## 8. Error và empty states

Tối thiểu phải có trạng thái được polish cho:

- homepage chưa có sản phẩm;
- catalog không có kết quả, kèm hành động bỏ bớt bộ lọc/xem tất cả;
- ảnh sản phẩm thiếu;
- giỏ hàng trống;
- checkout chưa hydrate/giỏ trống/submit lỗi;
- trang đơn không tìm thấy hoặc dữ liệu payment không sẵn sàng;
- admin chưa có đơn hoặc giao dịch cần đối soát.

Motif lá chỉ là điểm nhấn trang trí; copy phải tự giải thích trạng thái và bước
tiếp theo.

## 9. Testing và visual QA

Tất cả thay đổi behavior đi theo RED → GREEN:

- component tests cho brand, navbar/search/cart count, footer, banner, category
  links và trust strip;
- tests cho semantic landmark, accessible name, link `tel:`/`mailto:` và
  company copy;
- tests cho empty/error states được thay đổi;
- giữ nguyên các contract E2E hiện có.

Playwright:

- chạy happy path storefront ở mobile và desktop;
- keyboard đi qua navigation, search, product filters, variant selector, cart
  và checkout;
- kiểm tra reduced-motion không phụ thuộc animation;
- không dùng direct DB mutation để làm xanh luồng người dùng.

Visual QA:

- render và xem trực tiếp homepage, catalog, product detail, cart, checkout,
  order status và các trang admin đại diện;
- kiểm tra tối thiểu ở mobile hẹp và desktop;
- sửa overflow, clipping, contrast và hierarchy trước gate cuối.

Gate cuối:

1. `npx prisma generate`;
2. `npx prisma migrate deploy`;
3. `npm run lint`;
4. `npm run test`;
5. `npm run build`;
6. `npm run db:seed`;
7. `npm run test:e2e`;
8. `git diff --check`.

## 10. Ngoài phạm vi Ngày 9

- carousel/CMS banner;
- data model và logic giảm giá;
- review/rating;
- wishlist hoặc tài khoản khách;
- analytics/SEO nâng cao;
- tích hợp vận chuyển;
- bot hoặc automation Zalo;
- thay asset tạm bằng bộ nhận diện thật.

Các mục này được lưu và ưu tiên tại
`docs/07-post-day10-storefront-backlog.md`.

