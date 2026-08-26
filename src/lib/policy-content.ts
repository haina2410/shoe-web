import { STORE_INFO } from "@/lib/storefront-content";
import { toNavItems, type ContentPage } from "@/lib/content-page";

/**
 * Chín trang chính sách công bố công khai, phủ đủ danh mục tài liệu bắt buộc
 * của Bộ Công Thương:
 *
 * | # | Tài liệu BCT                              | slug                 |
 * |---|-------------------------------------------|----------------------|
 * | 1 | Chính sách bảo mật                        | bao-mat              |
 * | 2 | Tiếp nhận và giải quyết khiếu nại         | khieu-nai            |
 * | 3 | Chính sách giá                            | gia                  |
 * | 4 | Chính sách thanh toán                     | thanh-toan           |
 * | 5 | Điều kiện, hạn chế cung cấp hàng hoá      | dieu-kien-cung-cap   |
 * | 6 | Giao hàng, đổi trả và hoàn tiền           | giao-hang, doi-tra   |
 * | 7 | Hình thức hỗ trợ trực tuyến               | huong-dan-mua-hang   |
 * | 8 | Tài liệu khác                             | bao-hanh             |
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

/** Ngày hiệu lực in trên các trang chính sách; đổi khi biên tập lại nội dung. */
export const POLICY_EFFECTIVE_DATE = "26/08/2026" as const;

const CONTACT_LINE = `Zalo và điện thoại ${STORE_INFO.phoneDisplay}, email ${STORE_INFO.email}, trong giờ làm việc ${STORE_INFO.workingHours}.`;

export const POLICY_SLUGS = [
  "huong-dan-mua-hang",
  "gia",
  "thanh-toan",
  "giao-hang",
  "doi-tra",
  "bao-hanh",
  "dieu-kien-cung-cap",
  "khieu-nai",
  "bao-mat",
] as const;

export type PolicySlug = (typeof POLICY_SLUGS)[number];

export const POLICY_PAGES: Readonly<Record<PolicySlug, ContentPage>> = {
  "huong-dan-mua-hang": {
    href: "/chinh-sach/huong-dan-mua-hang",
    navLabel: "Hướng dẫn mua hàng và hỗ trợ",
    title: "Hướng dẫn mua hàng và hỗ trợ trực tuyến",
    metaDescription:
      "Các bước chọn sản phẩm, đặt hàng, thanh toán VietQR, tra cứu đơn hàng và các kênh hỗ trợ trực tuyến của leafshoes Việt Nam.",
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
        heading: "Hình thức hỗ trợ trực tuyến",
        bullets: [
          `Zalo: ${STORE_INFO.zaloUrl}. Đây là kênh trả lời nhanh nhất, gửi được ảnh sản phẩm và ảnh biên lai chuyển khoản.`,
          `Điện thoại: ${STORE_INFO.phoneDisplay}, trong giờ làm việc ${STORE_INFO.workingHours}.`,
          `Email: ${STORE_INFO.email}. Dùng cho yêu cầu cần lưu vết bằng văn bản như khiếu nại, bảo hành, đổi trả.`,
          "Trang Tra cứu đơn hàng: nhập mã đơn để tự xem trạng thái mà không cần liên hệ.",
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
  gia: {
    href: "/chinh-sach/gia",
    navLabel: "Chính sách giá",
    title: "Chính sách giá",
    metaDescription:
      "Giá niêm yết tại leafshoes tính bằng đồng Việt Nam, đã gồm thuế, chưa gồm phí giao hàng; giá được chốt tại thời điểm đặt đơn.",
    lead: "Mọi mức giá hiển thị trên website là giá bán lẻ cuối cùng cho một sản phẩm, tính bằng đồng Việt Nam và đã bao gồm thuế theo quy định.",
    sections: [
      {
        heading: "Giá niêm yết gồm những gì",
        bullets: [
          "Đơn vị tiền tệ là đồng Việt Nam (₫). Website không bán bằng ngoại tệ.",
          "Giá đã bao gồm thuế giá trị gia tăng theo quy định hiện hành.",
          "Giá chưa bao gồm phí giao hàng. Phí giao hàng là 30.000 ₫, được tính riêng và hiển thị trên trang xác nhận trước khi bạn chuyển khoản.",
          "Tổng tiền bạn cần chuyển luôn là tiền hàng cộng phí giao hàng, đúng bằng số tiền in trên mã VietQR.",
        ],
      },
      {
        heading: "Giá được chốt tại thời điểm đặt đơn",
        paragraphs: [
          "Chúng tôi có thể thay đổi giá niêm yết bất cứ lúc nào mà không báo trước. Tuy nhiên đơn hàng đã tạo thì giữ nguyên giá tại thời điểm bạn bấm đặt hàng: hệ thống lưu lại giá của từng sản phẩm vào chính đơn đó.",
          "Vì vậy giá thay đổi sau khi bạn đặt sẽ không làm thay đổi số tiền phải chuyển của đơn cũ, kể cả khi bạn chuyển khoản muộn hơn.",
        ],
      },
      {
        heading: "Nếu website niêm yết sai giá",
        paragraphs: [
          "Nếu một sản phẩm bị hiển thị sai giá rõ rệt do lỗi nhập liệu hoặc lỗi kỹ thuật, chúng tôi sẽ liên hệ báo bạn trước khi xử lý đơn.",
          "Bạn được chọn giữ đơn theo giá đúng, hoặc huỷ đơn. Nếu bạn đã chuyển khoản và chọn huỷ, chúng tôi hoàn lại toàn bộ số tiền đã nhận, không trừ khoản nào.",
        ],
      },
      {
        heading: "Khuyến mãi và mã giảm giá",
        bullets: [
          "Hiện website chưa áp dụng mã giảm giá. Ô nhập mã không tồn tại ở bước thanh toán.",
          "Khi có chương trình khuyến mãi, điều kiện và thời hạn áp dụng sẽ được công bố ngay tại trang chương trình đó.",
          "Mỗi đơn chỉ áp dụng một chương trình khuyến mãi, trừ khi chương trình ghi rõ được cộng gộp.",
          "Giá khuyến mãi cũng được chốt theo thời điểm đặt đơn như giá thường.",
        ],
      },
      {
        heading: "Hoá đơn",
        paragraphs: [
          `Nếu bạn cần hoá đơn giá trị gia tăng, hãy gửi thông tin xuất hoá đơn kèm mã đơn tới ${STORE_INFO.email} trong vòng 7 ngày kể từ ngày đặt hàng.`,
        ],
      },
    ],
  },
  "thanh-toan": {
    href: "/chinh-sach/thanh-toan",
    navLabel: "Chính sách thanh toán",
    title: "Chính sách thanh toán",
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
        heading: "Tài khoản nhận tiền",
        paragraphs: [
          `Số tài khoản nhận tiền chỉ hiển thị trên chính trang đơn hàng của bạn và trên mã VietQR của đơn đó. Chúng tôi không bao giờ nhắn cho bạn một số tài khoản khác qua Zalo, tin nhắn hay email. Nếu nhận được yêu cầu chuyển tới tài khoản lạ, hãy dừng lại và gọi ${STORE_INFO.phoneDisplay} để kiểm tra.`,
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
          "Chúng tôi gửi hàng qua đơn vị chuyển phát. Website không có hình thức nhận hàng tại kho và không gửi hàng qua xe khách.",
        ],
      },
      {
        heading: "Khi nào hàng được gửi",
        paragraphs: [
          "Chúng tôi chỉ đóng gói và gửi hàng sau khi đơn được xác nhận đã thanh toán. Đơn còn ở trạng thái chờ thanh toán thì hàng vẫn chưa xuất xưởng.",
          "Thời gian giao dự kiến 2 – 5 ngày làm việc tuỳ tỉnh thành, chưa tính ngày lễ. Đây là thời gian dự kiến, không phải cam kết chính xác từng ngày.",
        ],
      },
      {
        heading: "Kiểm tra hàng khi nhận",
        bullets: [
          "Bạn có quyền mở kiện hàng để kiểm tra ngay trước mặt nhân viên giao hàng.",
          "Hãy đối chiếu sản phẩm, màu và size với đơn hàng, và xem kiện hàng có bị móp, rách hay bung băng keo không.",
          "Nếu phát hiện sai sản phẩm hoặc hư hỏng do vận chuyển, hãy chụp ảnh ngay lúc nhận và từ chối nhận, hoặc ghi chú vào biên bản của đơn vị vận chuyển.",
          "Ảnh chụp lúc nhận hàng là bằng chứng quan trọng nhất khi bạn yêu cầu đổi trả vì hư hỏng trong vận chuyển.",
        ],
      },
      {
        heading: "Nếu giao không thành công",
        paragraphs: [
          `Trường hợp sai địa chỉ hoặc không liên lạc được, chúng tôi sẽ gọi hoặc nhắn Zalo theo số bạn để lại trước khi gửi lại lần nữa. Bạn cũng có thể chủ động liên hệ ${STORE_INFO.phoneDisplay} kèm mã đơn.`,
          "Chúng tôi không chịu trách nhiệm cho chậm trễ phát sinh từ địa chỉ hoặc số điện thoại bạn điền thiếu, điền sai, hoặc từ việc không liên lạc được với người nhận. Trường hợp phải gửi lại lần hai vì lý do này, bạn chịu phí giao hàng của lần gửi lại.",
        ],
      },
    ],
  },
  "doi-tra": {
    href: "/chinh-sach/doi-tra",
    navLabel: "Chính sách đổi trả và hoàn tiền",
    title: "Chính sách đổi trả và hoàn tiền",
    metaDescription:
      "Đổi trả trong 3 ngày cho sản phẩm lỗi sản xuất hoặc hư hỏng do vận chuyển, điều kiện đổi trả và cách leafshoes hoàn tiền.",
    lead: "Bạn có thể yêu cầu đổi hoặc trả hàng trong 3 ngày kể từ khi nhận, áp dụng cho sản phẩm lỗi sản xuất hoặc hư hỏng trong quá trình vận chuyển. Chúng tôi không nhận đổi trả vì lý do cá nhân. Lỗi sản xuất phát hiện muộn hơn vẫn được tiếp nhận theo chính sách bảo hành 30 ngày.",
    sections: [
      {
        heading: "Trường hợp được đổi trả",
        bullets: [
          "Sản phẩm có lỗi kỹ thuật từ nhà sản xuất, không phải lỗi do người dùng.",
          "Sản phẩm bị móp, rách, vỡ hoặc hư hại trong quá trình vận chuyển.",
          "Chúng tôi giao sai mẫu, sai màu hoặc sai size so với đơn hàng.",
          "Chúng tôi giao thiếu sản phẩm so với đơn hàng.",
        ],
      },
      {
        heading: "Điều kiện đổi trả",
        bullets: [
          "Yêu cầu được gửi trong vòng 3 ngày kể từ ngày bạn nhận hàng.",
          "Sản phẩm chưa qua sử dụng, còn nguyên đai nguyên kiện, không có dấu hiệu đã đi ngoài trời.",
          "Còn đủ hộp, nhãn, tem và toàn bộ phụ kiện đi kèm.",
          "Có mã đơn hàng để chúng tôi tra lại đúng đơn.",
          "Có ảnh chụp rõ phần lỗi, và với hư hỏng do vận chuyển thì cần ảnh chụp tại thời điểm nhận hàng.",
        ],
      },
      {
        heading: "Trường hợp không đổi trả",
        bullets: [
          "Mọi lý do cá nhân: chọn sai size, đổi ý, không thích kiểu dáng hay màu thực tế, mua nhầm. Hãy xem kỹ bảng size và ảnh sản phẩm trước khi đặt, hoặc hỏi trước qua Zalo — chúng tôi tư vấn size miễn phí.",
          "Hàng đã sử dụng, đã giặt, hoặc hư hỏng phát sinh trong quá trình sử dụng.",
          "Thiếu hộp, nhãn, tem hoặc phụ kiện; tem bị rách rời hoặc không còn đọc được.",
          "Trầy xước, ố màu, bể vỡ phát hiện sau khi bạn đã ký nhận hàng mà không ghi nhận tại thời điểm nhận.",
          "Sản phẩm đã được tự sửa hoặc sửa tại nơi khác trước khi cửa hàng kiểm tra.",
          "Yêu cầu gửi sau 3 ngày kể từ khi nhận hàng. Lỗi sản xuất vẫn được tiếp nhận theo chính sách bảo hành trong 30 ngày.",
        ],
      },
      {
        heading: "Cách gửi yêu cầu",
        paragraphs: [
          `Website chưa có form đổi trả tự phục vụ. Bạn nhắn Zalo hoặc gọi ${STORE_INFO.phoneDisplay}, hoặc gửi email tới ${STORE_INFO.email}, kèm mã đơn, mô tả tình trạng và ảnh sản phẩm.`,
          "Chúng tôi trả lời trong giờ làm việc, xác nhận yêu cầu có thuộc phạm vi đổi trả không, rồi hướng dẫn địa chỉ gửi hàng về. Bạn hãy chờ xác nhận trước khi gửi hàng đi.",
        ],
      },
      {
        heading: "Ai chịu phí gửi lại",
        bullets: [
          "Mọi trường hợp đổi trả hợp lệ đều thuộc lỗi từ phía chúng tôi hoặc đơn vị vận chuyển, nên chúng tôi chịu toàn bộ phí gửi hàng về và phí gửi hàng mới cho bạn.",
          "Nếu sau khi kiểm tra, sản phẩm không thuộc phạm vi đổi trả, chúng tôi gửi trả lại sản phẩm và bạn chịu phí gửi của hai chiều.",
          "Đổi sang cùng mẫu cùng size phụ thuộc tồn kho tại thời điểm xử lý. Nếu hết hàng, bạn chọn đổi sang mẫu khác cùng giá trị hoặc nhận hoàn tiền.",
        ],
      },
      {
        heading: "Hoàn tiền",
        bullets: [
          "Chúng tôi hoàn tiền khi: đổi trả hợp lệ mà bạn chọn không đổi sản phẩm; sản phẩm thay thế đã hết hàng; đơn bị huỷ sau khi bạn đã chuyển khoản; hoặc website niêm yết sai giá và bạn chọn huỷ đơn.",
          "Số tiền hoàn gồm tiền hàng và phí giao hàng đã thu, khi lỗi thuộc về chúng tôi hoặc đơn vị vận chuyển.",
          "Tiền được chuyển lại vào đúng tài khoản ngân hàng đã dùng để chuyển khoản cho đơn đó. Chúng tôi không hoàn sang tài khoản của người khác.",
          "Thời gian hoàn tiền trong vòng 7 ngày làm việc kể từ khi chúng tôi nhận và kiểm tra xong hàng trả về, hoặc kể từ khi xác nhận huỷ đơn.",
          "Mỗi lần hoàn tiền đều được ghi nhận vào sổ thanh toán của đơn, nên bạn có thể đối chiếu lại khi cần.",
        ],
      },
    ],
  },
  "bao-hanh": {
    href: "/chinh-sach/bao-hanh",
    navLabel: "Chính sách bảo hành",
    title: "Chính sách bảo hành",
    metaDescription:
      "Bảo hành lỗi sản xuất trong 30 ngày kể từ ngày nhận hàng, phạm vi áp dụng, trường hợp loại trừ và cách gửi yêu cầu bảo hành.",
    lead: "Sản phẩm được bảo hành lỗi sản xuất trong 30 ngày kể từ ngày bạn nhận hàng, căn cứ phiếu bảo hành kèm theo sản phẩm và tem niêm phong còn nguyên vẹn. Bảo hành áp dụng cho lỗi phát sinh từ quá trình sản xuất khi sản phẩm được sử dụng đúng cách.",
    sections: [
      {
        heading: "Điều kiện được bảo hành",
        bullets: [
          "Sản phẩm có phiếu bảo hành do leafshoes cấp, đặt sẵn trong hộp khi giao hàng. Hãy giữ phiếu này cho tới hết thời hạn bảo hành.",
          "Tem niêm phong của công ty trên sản phẩm còn nguyên vẹn, còn đọc được và không có dấu hiệu bị bóc, dán lại hay thay thế.",
          "Phiếu bảo hành còn trong thời hạn ghi trên phiếu.",
          "Sản phẩm được sử dụng và bảo quản đúng theo hướng dẫn đi kèm.",
        ],
      },
      {
        heading: "Phạm vi bảo hành",
        bullets: [
          "Thời hạn 30 ngày được tính từ ngày bạn nhận hàng, ghi trên phiếu bảo hành và đối chiếu được với đơn hàng trong hệ thống.",
          "Bong keo bất thường ở đế hoặc thân giày khi sử dụng bình thường.",
          "Bung, đứt hoặc tuột đường may không do va đập hay kéo rách.",
          "Hỏng phụ kiện và chi tiết sản phẩm như khoá, quai, dây, ô dê khi sử dụng đúng cách.",
          "Đế bị tách lớp hoặc biến dạng bất thường không do nhiệt hay hoá chất.",
        ],
      },
      {
        heading: "Trường hợp không bảo hành",
        bullets: [
          "Hết thời hạn 30 ngày kể từ ngày nhận hàng.",
          "Không xuất trình được phiếu bảo hành, hoặc phiếu bị tẩy xoá, sửa chữa, không còn đọc được.",
          "Tem niêm phong bị mất, rách rời, mờ không đọc được, hoặc có dấu hiệu bị bóc và dán lại.",
          "Hao mòn tự nhiên, trầy xước, bạc màu hoặc biến dạng phát sinh trong quá trình sử dụng.",
          "Hư hỏng do dùng sai mục đích, va đập, cắt rách, kéo giãn quá mức hoặc bảo quản không đúng cách.",
          "Hư hỏng do tiếp xúc với nước, nhiệt độ cao hoặc hoá chất không phù hợp với hướng dẫn sử dụng thông thường của sản phẩm.",
          "Hư hỏng do thiên tai, ẩm mốc, động vật hoặc côn trùng gây ra.",
          "Sản phẩm đã được tự sửa hoặc sửa tại nơi khác trước khi cửa hàng kiểm tra.",
          "Không xác định được đơn hàng đã mua sản phẩm đó tại leafshoes.",
        ],
      },
      {
        heading: "Cách gửi yêu cầu bảo hành",
        bullets: [
          `Nhắn Zalo hoặc gọi ${STORE_INFO.phoneDisplay}, hoặc gửi email tới ${STORE_INFO.email}.`,
          "Cung cấp mã đơn hàng, ảnh phiếu bảo hành, ảnh tem niêm phong, mô tả tình trạng và ảnh chụp rõ phần bị lỗi.",
          "Gửi kèm phiếu bảo hành bản gốc khi gửi sản phẩm về. Thiếu phiếu thì chúng tôi không tiếp nhận bảo hành.",
          "Chúng tôi trả lời trong vòng 2 ngày làm việc và hướng dẫn địa chỉ gửi sản phẩm về.",
          "Sau khi nhận sản phẩm, chúng tôi kiểm tra trong vòng 3 ngày làm việc và thông báo kết luận cho bạn.",
        ],
      },
      {
        heading: "Phương án xử lý và chi phí",
        bullets: [
          "Nếu đúng lỗi sản xuất trong phạm vi bảo hành: chúng tôi sửa chữa, hoặc đổi sản phẩm tương đương nếu không sửa được, và chịu toàn bộ chi phí gửi hai chiều.",
          "Nếu sản phẩm tương đương đã hết hàng, chúng tôi đổi sang mẫu khác cùng giá trị hoặc hoàn tiền, theo lựa chọn của bạn.",
          "Nếu kiểm tra cho thấy lỗi không thuộc phạm vi bảo hành, chúng tôi báo bạn trước và chỉ tiến hành sửa khi bạn đồng ý chi phí. Bạn chịu phí gửi của hai chiều.",
          "Thời gian sửa chữa dự kiến 5 – 10 ngày làm việc kể từ khi chúng tôi nhận sản phẩm.",
        ],
      },
    ],
  },
  "dieu-kien-cung-cap": {
    href: "/chinh-sach/dieu-kien-cung-cap",
    navLabel: "Điều kiện cung cấp hàng hoá",
    title: "Điều kiện và hạn chế trong việc cung cấp hàng hoá",
    metaDescription:
      "Điều kiện đặt hàng tại leafshoes: phạm vi bán hàng trong nước, giới hạn theo tồn kho, quyền từ chối đơn và các hạn chế của website.",
    lead: "Trang này nêu rõ những điều kiện bạn cần đáp ứng để đặt hàng, và những hạn chế mà website hiện có, để bạn biết trước khi bấm đặt hàng.",
    sections: [
      {
        heading: "Hàng hoá chúng tôi bán",
        bullets: [
          `${STORE_INFO.legalName} bán giày dép và phụ liệu do chính công ty sản xuất hoặc phân phối.`,
          "Toàn bộ sản phẩm là hàng mới, không kinh doanh hàng đã qua sử dụng.",
          "Chúng tôi không kinh doanh hàng hoá thuộc danh mục cấm hoặc hạn chế kinh doanh theo quy định pháp luật Việt Nam.",
          "Hình ảnh sản phẩm có thể chênh lệch nhẹ về màu do màn hình hiển thị. Bảng size và mô tả trên trang sản phẩm là căn cứ chính xác.",
        ],
      },
      {
        heading: "Điều kiện đặt hàng",
        bullets: [
          "Bạn phải từ đủ 18 tuổi, hoặc có người giám hộ đồng ý, để tự đặt hàng và thanh toán.",
          "Bạn phải cung cấp họ tên, số điện thoại, email và địa chỉ nhận hàng đúng và đầy đủ.",
          "Địa chỉ nhận hàng phải nằm trong 34 tỉnh thành hiển thị ở bước đặt hàng. Chúng tôi không giao hàng ra nước ngoài.",
          "Đơn hàng chỉ có hiệu lực sau khi hệ thống xác nhận nhận đủ tiền chuyển khoản đúng mã đơn.",
        ],
      },
      {
        heading: "Giới hạn số lượng và tồn kho",
        bullets: [
          "Số lượng đặt được giới hạn theo tồn kho thật của từng màu và từng size tại thời điểm bạn đặt.",
          "Sản phẩm hết hàng sẽ không thêm được vào giỏ, và không nhận đặt trước.",
          "Đơn chưa thanh toán không giữ hàng. Hàng chỉ thực sự trừ kho khi đơn được xác nhận đã thanh toán.",
          "Website phục vụ khách mua lẻ. Đơn số lượng lớn cho mục đích bán lại xin liên hệ trực tiếp để chúng tôi báo giá riêng.",
        ],
      },
      {
        heading: "Quyền từ chối hoặc huỷ đơn",
        paragraphs: [
          "Chúng tôi có quyền từ chối hoặc huỷ một đơn hàng khi: hết hàng thực tế sau khi đơn đã tạo; thông tin nhận hàng không đủ để giao; website niêm yết sai giá rõ rệt; hoặc đơn có dấu hiệu gian lận, đặt hàng ảo, phá rối.",
          "Trong mọi trường hợp huỷ đơn, nếu bạn đã chuyển khoản, chúng tôi hoàn lại toàn bộ số tiền đã nhận theo chính sách hoàn tiền.",
        ],
      },
      {
        heading: "Hạn chế hiện có của website",
        bullets: [
          "Chỉ nhận thanh toán chuyển khoản VietQR. Không có thanh toán khi nhận hàng, không có thẻ, không có ví điện tử.",
          "Đơn chưa thanh toán tự hết hạn sau 24 giờ kể từ lúc đặt.",
          "Không có tài khoản khách hàng. Bạn tra cứu đơn bằng mã đơn, nên hãy giữ lại email xác nhận.",
          "Chưa có form đổi trả, bảo hành hay khiếu nại tự phục vụ. Mọi yêu cầu gửi qua Zalo, điện thoại hoặc email.",
          "Giỏ hàng lưu trên trình duyệt của bạn, nên xoá dữ liệu trình duyệt là mất giỏ hàng.",
        ],
      },
    ],
  },
  "khieu-nai": {
    href: "/chinh-sach/khieu-nai",
    navLabel: "Tiếp nhận và giải quyết khiếu nại",
    title: "Phương thức tiếp nhận và giải quyết phản ánh, yêu cầu, khiếu nại",
    metaDescription:
      "Kênh tiếp nhận khiếu nại của leafshoes, thông tin cần cung cấp, thời hạn trả lời và các bước xử lý khi hai bên chưa thống nhất.",
    lead: "Chúng tôi tiếp nhận mọi phản ánh, yêu cầu và khiếu nại liên quan tới sản phẩm, đơn hàng, thanh toán, giao hàng và dịch vụ của cửa hàng.",
    sections: [
      {
        heading: "Kênh tiếp nhận",
        bullets: [
          `Điện thoại và Zalo: ${STORE_INFO.phoneDisplay}, trong giờ làm việc ${STORE_INFO.workingHours}.`,
          `Email: ${STORE_INFO.email}. Kênh này được ưu tiên cho khiếu nại vì lưu được vết bằng văn bản.`,
          `Địa chỉ trụ sở: ${STORE_INFO.address}.`,
        ],
      },
      {
        heading: "Thông tin cần cung cấp",
        bullets: [
          "Mã đơn hàng (dạng LEAFXXXXXX) và họ tên, số điện thoại đã dùng để đặt.",
          "Nội dung phản ánh: sự việc xảy ra khi nào, sản phẩm hay khâu nào có vấn đề.",
          "Ảnh hoặc video minh chứng, nếu có: ảnh sản phẩm, ảnh kiện hàng lúc nhận, ảnh biên lai chuyển khoản.",
          "Mong muốn của bạn: đổi hàng, trả hàng, hoàn tiền, bảo hành hay chỉ góp ý.",
        ],
      },
      {
        heading: "Thời hạn xử lý",
        bullets: [
          "Chúng tôi xác nhận đã nhận khiếu nại trong vòng 24 giờ làm việc kể từ khi bạn gửi.",
          "Chúng tôi trả lời phương án xử lý trong vòng 3 ngày làm việc.",
          "Vụ việc phức tạp cần kiểm tra sản phẩm, đối chiếu sao kê ngân hàng hoặc làm việc với đơn vị vận chuyển: tối đa 7 ngày làm việc, và chúng tôi báo bạn tiến độ trong thời gian đó.",
          "Khiếu nại về thanh toán được ưu tiên xử lý trong ngày làm việc kế tiếp.",
        ],
      },
      {
        heading: "Các bước xử lý",
        bullets: [
          "Tiếp nhận: chúng tôi ghi nhận khiếu nại, gắn với đúng mã đơn và xác nhận lại với bạn.",
          "Xác minh: đối chiếu đơn hàng, sổ thanh toán, ảnh minh chứng và nếu cần thì kiểm tra sản phẩm gửi về.",
          "Trả lời: chúng tôi thông báo kết luận và phương án cụ thể, gồm cả căn cứ dẫn tới kết luận đó.",
          "Thực hiện: sửa chữa, đổi hàng, hoàn tiền hoặc điều chỉnh theo phương án hai bên đã thống nhất.",
        ],
      },
      {
        heading: "Nếu bạn chưa đồng ý với kết quả",
        paragraphs: [
          `Bạn có thể yêu cầu xem xét lại bằng cách trả lời chính email đã trao đổi, hoặc gửi email mới tới ${STORE_INFO.email} kèm mã đơn và lý do chưa đồng ý. Khiếu nại lần hai được người phụ trách cửa hàng xem xét trực tiếp.`,
          "Hai bên ưu tiên giải quyết trên cơ sở thương lượng và thiện chí. Nếu vẫn chưa thống nhất, bạn có quyền đưa vụ việc tới cơ quan bảo vệ quyền lợi người tiêu dùng hoặc toà án có thẩm quyền theo quy định pháp luật Việt Nam.",
        ],
      },
    ],
  },
  "bao-mat": {
    href: "/chinh-sach/bao-mat",
    navLabel: "Chính sách bảo mật thông tin",
    title: "Chính sách bảo mật thông tin",
    metaDescription:
      "Thông tin leafshoes thu thập khi bạn đặt hàng, mục đích sử dụng, cách lưu trữ, thời gian lưu và quyền của bạn.",
    lead: "Chúng tôi chỉ thu thập thông tin cần thiết để giao được đơn hàng của bạn, và không dùng cho mục đích nào khác.",
    sections: [
      {
        heading: "Thông tin chúng tôi thu thập",
        bullets: [
          "Họ tên, số điện thoại, email và địa chỉ nhận hàng bạn điền khi đặt hàng.",
          "Ghi chú đơn hàng, nếu bạn viết.",
          "Thông tin giao dịch chuyển khoản do ngân hàng cung cấp, dùng để đối soát tiền về đúng đơn.",
          "Nội dung bạn gửi khi liên hệ hỗ trợ, bảo hành hoặc khiếu nại, gồm cả ảnh minh chứng.",
        ],
      },
      {
        heading: "Phạm vi thu thập",
        paragraphs: [
          "Chúng tôi chỉ thu thập thông tin do chính bạn cung cấp, qua các nguồn: form đặt hàng trên website; trao đổi trực tiếp tại cửa hàng và trụ sở công ty; hotline chăm sóc khách hàng; Zalo; và email. Website không đặt mã theo dõi quảng cáo và không thu thập dữ liệu hành vi duyệt web của bạn.",
        ],
      },
      {
        heading: "Chúng tôi dùng để làm gì",
        bullets: [
          "Giao hàng và liên hệ khi cần xác nhận địa chỉ.",
          "Gửi email xác nhận đơn và xác nhận thanh toán.",
          "Đối soát thanh toán và xử lý yêu cầu bảo hành, đổi trả, hoàn tiền, khiếu nại.",
          "Gửi thông báo về chính sách mới, sản phẩm mới và chương trình khuyến mãi của cửa hàng. Mỗi email loại này đều có đường dẫn từ chối nhận, hoặc bạn nhắn một câu tới Zalo của cửa hàng là chúng tôi dừng gửi.",
          "Đáp ứng nghĩa vụ kế toán và nghĩa vụ pháp lý liên quan tới đơn hàng.",
        ],
      },
      {
        heading: "Những gì chúng tôi không làm",
        bullets: [
          "Không bán hoặc cho thuê dữ liệu của bạn cho bên thứ ba.",
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
          "Ngoài đơn vị vận chuyển, chúng tôi không cung cấp thông tin của bạn cho bên thứ ba nào khác, trừ khi có yêu cầu hợp pháp bằng văn bản của cơ quan nhà nước có thẩm quyền.",
        ],
      },
      {
        heading: "Thời gian lưu trữ",
        paragraphs: [
          "Chúng tôi lưu thông tin đơn hàng trong 24 tháng kể từ ngày đặt, đủ để phục vụ bảo hành, đối soát và nghĩa vụ kế toán. Hết thời hạn này, dữ liệu được xoá hoặc ẩn danh, trừ phần chứng từ mà pháp luật yêu cầu lưu lâu hơn.",
        ],
      },
      {
        heading: "Đơn vị chịu trách nhiệm và hiệu lực",
        paragraphs: [
          `${STORE_INFO.legalName}, địa chỉ ${STORE_INFO.address}. Liên hệ: ${CONTACT_LINE}`,
          `Chính sách này có hiệu lực từ ngày ${POLICY_EFFECTIVE_DATE}. Khi có thay đổi, bản mới được công bố ngay trên trang này.`,
        ],
      },
    ],
  },
};

export const POLICY_PAGE_LIST = POLICY_SLUGS.map((slug) => POLICY_PAGES[slug]);

export const POLICY_NAV = toNavItems(POLICY_PAGE_LIST);

export const POLICY_NAV_LABEL = "Chính sách" as const;
