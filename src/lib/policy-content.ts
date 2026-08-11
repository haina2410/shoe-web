import { STORE_INFO } from "@/lib/storefront-content";
import { toNavItems, type ContentPage } from "@/lib/content-page";

/**
 * Năm trang chính sách bắt buộc của một shop bán hàng online tại Việt Nam.
 *
 * Nội dung ở đây phải khớp với hành vi THẬT của hệ thống, vì khách sẽ đọc rồi
 * làm theo:
 * - phí giao hàng phẳng 30.000 ₫ (một zone mặc định trong seed);
 * - chỉ thanh toán chuyển khoản VietQR, nội dung = mã đơn, đối soát tự động;
 * - đơn chưa thanh toán tự chuyển EXPIRED sau 24 giờ (job `expire-unpaid`);
 * - hoàn tiền do nhân sự ghi nhận tay vào sổ thanh toán của đơn;
 * - không có tài khoản khách hàng, không analytics, giỏ hàng nằm ở localStorage.
 * Sửa hành vi trong code thì phải sửa cả trang tương ứng ở đây.
 */

export const POLICY_SLUGS = [
  "huong-dan-mua-hang",
  "giao-hang",
  "thanh-toan",
  "doi-tra",
  "bao-mat",
] as const;

export type PolicySlug = (typeof POLICY_SLUGS)[number];

export const POLICY_PAGES: Readonly<Record<PolicySlug, ContentPage>> = {
  "huong-dan-mua-hang": {
    href: "/chinh-sach/huong-dan-mua-hang",
    navLabel: "Hướng dẫn mua hàng",
    title: "Hướng dẫn mua hàng",
    metaDescription:
      "Các bước chọn sản phẩm, đặt hàng, thanh toán VietQR và tra cứu đơn hàng tại leafshoes Việt Nam.",
    lead: "Bạn có thể đặt hàng trực tiếp trên website mà không cần tạo tài khoản. Hãy lưu mã đơn để thanh toán và theo dõi trạng thái sau khi đặt.",
    sections: [
      {
        heading: "Các bước mua hàng",
        bullets: [
          "Xem danh sách sản phẩm, mở sản phẩm bạn muốn mua rồi chọn đúng màu, size và số lượng còn hàng.",
          "Bấm “Thêm vào giỏ”, mở giỏ hàng và kiểm tra lại sản phẩm, phiên bản cùng số lượng. Bạn có thể tăng, giảm hoặc xoá sản phẩm trước khi tiếp tục.",
          "Tới trang thanh toán, điền họ tên, email, số điện thoại và địa chỉ nhận hàng đầy đủ. Email được dùng để gửi xác nhận đơn và xác nhận thanh toán.",
          "Kiểm tra tiền hàng rồi bấm “Đặt hàng”. Hệ thống tạo mã đơn và chuyển bạn tới trang xác nhận, nơi hiển thị sản phẩm, phí giao hàng và tổng tiền cần thanh toán.",
          "Quét mã VietQR và chuyển đúng số tiền, đúng nội dung là mã đơn. Đơn chỉ được đóng gói sau khi hệ thống xác nhận đã nhận tiền.",
        ],
      },
      {
        heading: "Sau khi đặt hàng",
        bullets: [
          "Trang xác nhận và email đặt hàng đều có mã đơn. Bạn có thể nhập mã này tại trang Tra cứu đơn hàng để xem trạng thái mới nhất.",
          "Khi giao dịch khớp, hệ thống chuyển đơn sang trạng thái đã thanh toán và gửi email xác nhận.",
          "Đơn chưa thanh toán tự hết hạn sau 24 giờ và không còn giữ hàng. Nếu vẫn muốn mua, bạn cần đặt lại đơn mới.",
        ],
      },
      {
        heading: "Cần thay đổi thông tin đơn hàng",
        paragraphs: [
          `Website chưa hỗ trợ tự sửa đơn đã đặt. Bạn hãy liên hệ Zalo hoặc gọi ${STORE_INFO.phoneDisplay}, hoặc gửi email tới ${STORE_INFO.email}, kèm mã đơn và nội dung cần hỗ trợ. Khả năng thay đổi phụ thuộc trạng thái xử lý thực tế của đơn.`,
        ],
      },
    ],
  },
  "thanh-toan": {
    href: "/chinh-sach/thanh-toan",
    navLabel: "Hình thức thanh toán",
    title: "Hình thức thanh toán",
    metaDescription:
      "Cách thanh toán đơn hàng leafshoes bằng chuyển khoản VietQR: chuyển đúng số tiền, nội dung đúng mã đơn, hệ thống tự đối soát.",
    lead: "Chúng tôi chỉ nhận chuyển khoản ngân hàng qua VietQR. Không thu tiền khi nhận hàng (COD), không thanh toán thẻ.",
    sections: [
      {
        heading: "Các bước thanh toán",
        bullets: [
          "Đặt hàng trên website. Sau khi đặt, bạn được chuyển tới trang đơn hàng có mã QR, số tiền cần chuyển và nội dung chuyển khoản.",
          "Quét mã VietQR bằng app ngân hàng, hoặc chuyển thủ công đúng số tiền tới số tài khoản hiển thị trên trang đơn.",
          "Nội dung chuyển khoản phải là mã đơn hàng (dạng LEAFXXXXXX). Đây là căn cứ duy nhất để hệ thống biết tiền thuộc đơn nào.",
          "Khi tiền về và khớp mã đơn, hệ thống tự chuyển đơn sang trạng thái đã thanh toán và gửi email xác nhận cho bạn.",
        ],
      },
      {
        heading: "Nếu chuyển sai nội dung hoặc sai số tiền",
        paragraphs: [
          "Giao dịch không khớp sẽ không tự động xác nhận, mà vào hàng chờ để nhân sự đối soát tay. Bạn hãy gửi ảnh biên lai chuyển khoản kèm mã đơn qua Zalo hoặc điện thoại để chúng tôi xử lý nhanh.",
          `Zalo và điện thoại: ${STORE_INFO.phoneDisplay}. Email: ${STORE_INFO.email}.`,
        ],
      },
      {
        heading: "Thời hạn thanh toán",
        paragraphs: [
          "Đơn chưa thanh toán sẽ tự hết hạn sau 24 giờ kể từ lúc đặt và không còn giữ hàng nữa. Nếu vẫn muốn mua, bạn chỉ cần đặt lại đơn mới — hàng còn thì đơn mới vẫn nhận được.",
        ],
      },
      {
        heading: "Email bạn sẽ nhận",
        bullets: [
          "Email xác nhận đã nhận đơn: gửi ngay sau khi đặt, kèm mã đơn và thông tin chuyển khoản.",
          "Email xác nhận đã thanh toán: gửi khi hệ thống đối soát được tiền của bạn.",
        ],
      },
    ],
  },
  "giao-hang": {
    href: "/chinh-sach/giao-hang",
    navLabel: "Chính sách giao hàng",
    title: "Chính sách giao hàng",
    metaDescription:
      "Phí giao hàng phẳng 30.000 ₫ toàn quốc, phạm vi 34 tỉnh thành, chỉ gửi hàng sau khi xác nhận thanh toán.",
    lead: "Phí giao hàng là 30.000 ₫ cho mọi đơn và mọi tỉnh thành. Phí được cộng vào tổng đơn và hiển thị trên trang xác nhận trước khi bạn chuyển khoản.",
    sections: [
      {
        heading: "Phạm vi và phí",
        bullets: [
          "Giao hàng tới 34 tỉnh thành trong danh sách hiện ra ở bước đặt hàng.",
          "Một mức phí duy nhất 30.000 ₫, không phân vùng nội thành hay ngoại thành, không cộng thêm theo số lượng.",
          "Địa chỉ nhận hàng gồm tỉnh/thành, phường/xã và số nhà — đường. Hãy ghi đủ để đơn vị vận chuyển tìm được.",
        ],
      },
      {
        heading: "Khi nào hàng được gửi",
        paragraphs: [
          "Chúng tôi chỉ đóng gói và gửi hàng sau khi đơn được xác nhận đã thanh toán. Đơn còn ở trạng thái chờ thanh toán thì hàng vẫn chưa xuất xưởng.",
          "Thời gian giao dự kiến 2 – 5 ngày làm việc tuỳ tỉnh thành, chưa tính ngày lễ.",
        ],
      },
      {
        heading: "Nếu giao không thành công",
        paragraphs: [
          `Trường hợp sai địa chỉ hoặc không liên lạc được, chúng tôi sẽ gọi hoặc nhắn Zalo theo số bạn để lại trước khi gửi lại lần nữa. Bạn cũng có thể chủ động liên hệ ${STORE_INFO.phoneDisplay} kèm mã đơn.`,
        ],
      },
    ],
  },
  "doi-tra": {
    href: "/chinh-sach/doi-tra",
    navLabel: "Chính sách bảo hành và đổi trả",
    title: "Chính sách bảo hành và đổi trả",
    metaDescription:
      "Bảo hành lỗi sản xuất trong 30 ngày, điều kiện đổi trả trong 7 ngày và cách gửi yêu cầu tới leafshoes Việt Nam.",
    lead: "Sản phẩm được bảo hành lỗi sản xuất trong 30 ngày kể từ khi nhận hàng. Bạn có thể yêu cầu đổi hoặc trả trong 7 ngày đầu nếu đáp ứng điều kiện bên dưới.",
    sections: [
      {
        heading: "Bảo hành lỗi sản xuất trong 30 ngày",
        bullets: [
          "Thời hạn 30 ngày được tính từ ngày bạn nhận hàng.",
          "Bảo hành áp dụng cho lỗi phát sinh từ quá trình sản xuất như bong keo bất thường, bung hoặc đứt đường may, hỏng phụ kiện hay chi tiết sản phẩm khi sử dụng đúng cách.",
          "Bạn cần cung cấp mã đơn, mô tả tình trạng và ảnh rõ phần bị lỗi để chúng tôi xác định đúng sản phẩm.",
          "Từ ngày thứ 8 đến ngày thứ 30, cửa hàng chỉ tiếp nhận bảo hành lỗi sản xuất, không áp dụng đổi trả vì chọn sai size hoặc thay đổi nhu cầu.",
        ],
      },
      {
        heading: "Phạm vi không bảo hành",
        bullets: [
          "Hao mòn tự nhiên, trầy xước hoặc biến dạng phát sinh trong quá trình sử dụng.",
          "Hư hỏng do dùng sai mục đích, va đập, cắt rách hoặc bảo quản không đúng cách.",
          "Hư hỏng do tiếp xúc với nước, nhiệt hoặc hoá chất không phù hợp với hướng dẫn sử dụng thông thường của sản phẩm.",
          "Sản phẩm đã được tự sửa hoặc sửa tại nơi khác trước khi cửa hàng kiểm tra.",
        ],
      },
      {
        heading: "Cách xử lý bảo hành",
        paragraphs: [
          `Bạn nhắn Zalo hoặc gọi ${STORE_INFO.phoneDisplay}, hoặc gửi email tới ${STORE_INFO.email}, kèm mã đơn, mô tả và ảnh sản phẩm. Sau khi kiểm tra, chúng tôi sẽ thông báo phương án sửa chữa, đổi sản phẩm tương đương hoặc giải pháp khác được hai bên thống nhất.`,
          "Nếu xác nhận là lỗi sản xuất thuộc phạm vi bảo hành, chúng tôi chịu chi phí gửi sản phẩm về và gửi lại cho bạn.",
        ],
      },
      {
        heading: "Điều kiện đổi trả",
        bullets: [
          "Hàng chưa qua sử dụng, không có dấu hiệu đã đi ngoài trời.",
          "Còn hộp, nhãn và phụ kiện kèm theo.",
          "Có mã đơn hàng để chúng tôi tra lại đúng đơn.",
        ],
      },
      {
        heading: "Ai chịu phí gửi lại",
        bullets: [
          "Lỗi từ phía chúng tôi (giao sai mẫu, sai size, lỗi sản xuất): chúng tôi chịu toàn bộ phí gửi lại.",
          "Đổi vì lý do cá nhân (chọn sai size, đổi ý): bạn chịu phí gửi hàng về và phí gửi hàng mới.",
          "Đổi size cùng mẫu phụ thuộc tồn kho của size đó tại thời điểm xử lý.",
        ],
      },
      {
        heading: "Cách gửi yêu cầu",
        paragraphs: [
          `Website chưa có form đổi trả tự phục vụ. Bạn nhắn Zalo hoặc gọi ${STORE_INFO.phoneDisplay}, hoặc gửi email tới ${STORE_INFO.email}, kèm mã đơn và ảnh sản phẩm. Chúng tôi trả lời trong giờ làm việc và hướng dẫn địa chỉ gửi hàng về.`,
        ],
      },
      {
        heading: "Hoàn tiền",
        paragraphs: [
          "Tiền được chuyển lại vào đúng tài khoản đã dùng để chuyển khoản, sau khi chúng tôi nhận và kiểm tra hàng. Mỗi lần hoàn tiền đều được ghi nhận vào sổ thanh toán của đơn, nên bạn có thể đối chiếu lại khi cần.",
        ],
      },
      {
        heading: "Không áp dụng đổi trả",
        bullets: [
          "Hàng đã sử dụng, đã giặt hoặc hư hỏng do quá trình sử dụng.",
          "Hàng thiếu hộp, nhãn hoặc phụ kiện.",
          "Yêu cầu đổi trả gửi sau 7 ngày kể từ khi nhận hàng. Lỗi sản xuất vẫn được tiếp nhận bảo hành trong thời hạn 30 ngày.",
        ],
      },
    ],
  },
  "bao-mat": {
    href: "/chinh-sach/bao-mat",
    navLabel: "Chính sách bảo mật thông tin",
    title: "Chính sách bảo mật thông tin",
    metaDescription:
      "Thông tin leafshoes thu thập khi bạn đặt hàng, mục đích sử dụng, cách lưu trữ và quyền của bạn.",
    lead: "Chúng tôi chỉ thu thập thông tin cần thiết để giao được đơn hàng của bạn, và không dùng cho mục đích nào khác.",
    sections: [
      {
        heading: "Thông tin chúng tôi thu thập",
        bullets: [
          "Họ tên, số điện thoại, email và địa chỉ nhận hàng bạn điền khi đặt hàng.",
          "Ghi chú đơn hàng, nếu bạn viết.",
          "Thông tin giao dịch chuyển khoản do ngân hàng cung cấp, dùng để đối soát tiền về đúng đơn.",
        ],
      },
      {
        heading: "Chúng tôi dùng để làm gì",
        bullets: [
          "Giao hàng và liên hệ khi cần xác nhận địa chỉ.",
          "Gửi email xác nhận đơn và xác nhận thanh toán.",
          "Đối soát thanh toán và xử lý yêu cầu đổi trả, hoàn tiền.",
        ],
      },
      {
        heading: "Những gì chúng tôi không làm",
        bullets: [
          "Không bán hoặc cho thuê dữ liệu của bạn cho bên thứ ba.",
          "Không gửi email quảng cáo; chúng tôi chỉ gửi email liên quan trực tiếp tới đơn của bạn.",
          "Không yêu cầu bạn tạo tài khoản, không đặt mã theo dõi quảng cáo trên website.",
          "Không bao giờ hỏi mật khẩu ngân hàng, mã OTP hay số thẻ của bạn — dù qua điện thoại, Zalo hay email.",
        ],
      },
      {
        heading: "Giỏ hàng lưu ở đâu",
        paragraphs: [
          "Giỏ hàng được lưu ngay trên trình duyệt của bạn và chỉ được gửi về hệ thống khi bạn bấm đặt hàng. Bạn xoá dữ liệu trình duyệt là giỏ hàng mất theo.",
        ],
      },
      {
        heading: "Lưu trữ và chia sẻ",
        bullets: [
          "Thông tin đơn hàng được lưu trong hệ thống của công ty, chỉ nhân sự được phân quyền mới xem được.",
          "Chúng tôi chia sẻ tên, số điện thoại và địa chỉ cho đơn vị vận chuyển ở mức tối thiểu để giao được hàng.",
        ],
      },
      {
        heading: "Quyền của bạn",
        paragraphs: [
          `Bạn có thể yêu cầu xem, sửa hoặc xoá thông tin của mình bằng cách liên hệ ${STORE_INFO.email} hoặc ${STORE_INFO.phoneDisplay}, kèm mã đơn để chúng tôi xác định đúng đơn. Chúng tôi giữ lại dữ liệu đơn hàng ở mức cần thiết cho nghĩa vụ kế toán và bảo hành.`,
        ],
      },
    ],
  },
};

export const POLICY_PAGE_LIST = POLICY_SLUGS.map((slug) => POLICY_PAGES[slug]);

export const POLICY_NAV = toNavItems(POLICY_PAGE_LIST);

export const POLICY_NAV_LABEL = "Chính sách" as const;
