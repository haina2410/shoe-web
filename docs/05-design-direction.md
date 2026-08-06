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

Trang chủ theo cấu trúc curated storefront: navbar có tìm kiếm và số lượng giỏ,
banner tĩnh, ba lối vào danh mục, sản phẩm mới, trust strip và footer doanh
nghiệp. Không dùng carousel, giá giảm giả, countdown hoặc số liệu bán hàng không
có nguồn dữ liệu thật. Search dùng GET tới `/products?q=<query>`; cart count là
client island nhỏ, không biến toàn bộ header thành Client Component.

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
