# 05 — Hướng thiết kế: leafshoes Việt Nam

**Định vị:** bán lẻ tối giản (minimal retail), product-forward. Chủ thể: cửa hàng giày Việt, khách hàng ưa sự sạch sẽ, tin cậy, hiện đại. Nhiệm vụ trang chủ: đưa sản phẩm lên trước, tạo cảm giác chỉn chu đáng tin để khách yên tâm chuyển khoản.

**Tránh 3 khuôn mẫu AI:** (1) nền kem + serif + cam đất; (2) nền đen + xanh acid; (3) layout báo giấy. Ta khai thác chữ **"leaf"** một cách tiết chế, không sến.

## Token màu

| Vai trò | Hex | Ghi chú |
|---|---|---|
| Paper (nền) | `#FAFAF7` | trắng ấm rất nhẹ, không ngả kem chợ |
| Ink (chữ) | `#171717` | gần đen, tương phản cao |
| Evergreen (thương hiệu) | `#1B4332` | xanh thực vật trầm — màu neo, dùng cho nav/nút chính/footer |
| Sage (bề mặt) | `#DCE7DF` | xanh nhạt cho card/section nền |
| Line (kẻ) | `#E7E5E0` | hairline divider |
| Accent | `#2D6A4F` | xanh sáng hơn, **dùng rất tiết chế** (hover, badge) |

Nguyên tắc: nền paper + chữ ink chiếm ~90% diện tích; evergreen làm điểm neo; accent chỉ xuất hiện ở tương tác. Không dùng gradient loè.

## Typography

**Bắt buộc: font hỗ trợ đầy đủ dấu tiếng Việt.**

- **Body & UI:** `Be Vietnam Pro` — thiết kế cho tiếng Việt, dấu chuẩn, nhiều weight. Dùng 400/500 cho nội dung, 600 cho nhãn.
- **Display (tiêu đề/hero):** `Be Vietnam Pro` weight 700–800 với letter-spacing âm nhẹ, cỡ lớn — tạo tương phản mạnh mà vẫn đảm bảo dấu tiếng Việt. (Nếu muốn một display face riêng, chỉ chọn font đã kiểm tra có bộ dấu tiếng Việt đầy đủ; không đánh đổi tính đọc được của dấu.)
- **Type scale:** rõ ràng, ít bậc — VD 12 / 14 / 16 / 20 / 28 / 40 / 56.

## Layout

- Nav tối giản dính trên: logo trái, danh mục giữa/phải, giỏ hàng góc phải. Nền paper, kẻ hairline dưới.
- **Hero product-forward:** mở đầu bằng **ảnh sản phẩm lớn** (không phải "số to + nhãn nhỏ"), tiêu đề ngắn + 1 CTA.
- Lưới sản phẩm như gallery, nhiều khoảng trắng, card viền hairline (không đổ bóng nặng).
- Trang chi tiết: ảnh lớn bên trái, chọn size/màu + tồn kho + nút thêm giỏ bên phải.

Trang chủ theo cấu trúc curated storefront: navbar có tìm kiếm, liên kết “Tra
cứu đơn hàng” và số lượng giỏ, banner tĩnh, ba lối vào danh mục, sản phẩm mới,
trust strip và footer doanh nghiệp. Footer cũng có liên kết “Tra cứu đơn hàng”.
Không dùng carousel, giá giảm giả, countdown hoặc số liệu bán hàng không có nguồn
dữ liệu thật. Search dùng GET tới `/products?q=<query>`; cart count là client
island nhỏ, không biến toàn bộ header thành Client Component.

Trang tra cứu công khai tại `/orders` nhận mã đơn từ biểu mẫu hoặc URL. Mã được
cắt khoảng trắng, chuyển sang chữ hoa và, nếu tồn tại, chuyển hướng đến
`/orders/[orderCode]`. Mã sai định dạng và mã không tồn tại cùng hiển thị một
banner “Không tìm thấy đơn hàng”, để không tiết lộ mã nào đã tồn tại.

## Bề mặt quản trị

Admin là giao diện vận hành, ưu tiên khả năng quét thông tin và thao tác an
toàn thay vì mô phỏng storefront. Tiêu đề trang dùng cỡ 28–32px; mã đơn, tổng
tiền, tiền đã nhận/hoàn và tồn kho quan trọng dùng cỡ 20–24px, đậm hơn; tiêu đề
khối dùng 18–20px; metadata và thời điểm dùng 13–14px. Nội dung được nhóm trong
card trắng viền mảnh, đệm 20–24px. Bảng có header rõ, khoảng đệm hàng đủ rộng,
hover/focus rõ ràng và cuộn ngang khi cần.

Màu hành động diễn đạt hậu quả: xanh cho lưu và chuyển tiếp an toàn, amber cho
xác nhận thanh toán, hoàn tiền và ghép giao dịch, đỏ cho huỷ đơn và xoá sản
phẩm; nút viền trung tính dành cho lọc, đóng và điều hướng. Badge luôn có nhãn
chữ: chờ thanh toán/review và hoàn một phần là amber; đã thanh toán/đã ghép là
xanh dương; đang giao là tím; hoàn tất/đã hoàn toàn bộ là xanh; huỷ, hết hàng là
đỏ; trạng thái trung tính là xám. Không truyền đạt trạng thái chỉ bằng màu.

Thao tác amber và đỏ mở hộp thoại xác nhận nêu rõ đối tượng và hệ quả; nút hủy
không làm thay đổi dữ liệu. Lưu thông thường và chuyển tiếp an toàn là một
bước. Khi mutation đang chạy, nút khởi tạo hiển thị nhãn chờ và spinner, các
thao tác cạnh tranh bị khóa và trường đang gửi bị vô hiệu hóa. Thành công hiển
thị toast live ngắn, lỗi nằm cạnh thao tác với alert/live region; cả hai không
thay thế dữ liệu đã được làm mới từ server. Admin không optimistic-update đơn,
payment ledger, tồn kho hoặc đối soát.

Điều hướng admin giữ trạng thái active, có cuộn ngang khi hẹp và mọi thao tác
chính cao tối thiểu 40px. Trên mobile, summary và action xếp dọc theo thứ tự
đọc, không thu nhỏ mục tiêu chạm; bảng tiếp tục cuộn ngang. Dialog giữ focus
bên trong, trả focus về trigger khi đóng, cho Escape/hủy khi không pending.
Toast không cướp focus; keyboard focus và pending state luôn nhìn thấy được.

## Signature (điểm nhấn duy nhất)

**Nét lá / gân lá hairline** — một motif đường mảnh hình gân lá dùng làm:
- divider giữa các mục,
- dấu nhấn ở empty state (giỏ trống, không có kết quả tìm kiếm),
- chi tiết trong logo/wordmark "leafshoes".

Chỉ dồn sự táo bạo vào chi tiết lá này; mọi thứ khác giữ kỷ luật, sạch, nhiều khoảng trắng. (Quy tắc Chanel: bớt một phụ kiện trước khi ra khỏi nhà.)

## Sàn chất lượng (không cần khoe)

- Responsive tới mobile.
- Focus bàn phím hiển thị rõ.
- Tôn trọng `prefers-reduced-motion`.
- Motion tiết chế: hover đổi ảnh sản phẩm, reveal nhẹ khi cuộn — không lạm dụng (dễ thành "AI-generated").
- Có skip link và landmark `header`, `nav`, `main`, `footer` đúng nghĩa.
- Touch target chính khoảng 44px trên mobile; lỗi không chỉ truyền đạt bằng màu.
- Empty/error state luôn giải thích bước tiếp theo; ảnh thiếu có fallback ổn định.
- Nội dung tự động không đổi slide hoặc giành focus.

## Giọng văn (copy)

- Tiếng Việt, câu ngắn, động từ chủ động. Nút nói đúng việc: "Thêm vào giỏ", "Đặt hàng", "Xác nhận đã thanh toán".
- Trạng thái lỗi/rỗng chỉ đường, không xin lỗi lê thê: giỏ trống → mời tiếp tục mua; tìm không ra → gợi ý bỏ bớt bộ lọc.
- Nhất quán: nút "Đặt hàng" → thông báo "Đã tạo đơn".
