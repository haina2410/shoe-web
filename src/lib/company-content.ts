import { STORE_INFO } from "@/lib/storefront-content";
import { toNavItems, type ContentPage } from "@/lib/content-page";

/**
 * Nội dung khối "Tổng quan doanh nghiệp": giới thiệu công ty, nhà máy và chi
 * nhánh.
 *
 * Quy tắc khi biên tập: chỉ nói những gì hệ thống thật sự làm được (phí giao
 * hàng phẳng, thanh toán VietQR đúng mã đơn, tồn kho theo từng biến thể). Không
 * đưa con số chưa kiểm chứng được (số năm kinh nghiệm, diện tích xưởng, sản
 * lượng) vào đây.
 */

export const WORKING_HOURS = "8:00 – 17:30, Thứ Hai – Thứ Bảy" as const;

export const MAP_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  STORE_INFO.address,
)}`;

export const GIOI_THIEU_PAGE: ContentPage = {
  href: "/gioi-thieu",
  navLabel: "Giới thiệu công ty",
  title: "Giới thiệu công ty",
  metaDescription: `${STORE_INFO.legalName} — ${STORE_INFO.businessLine}, bán trực tiếp tới khách hàng qua website leafshoes.`,
  lead: `${STORE_INFO.legalName} là đơn vị ${STORE_INFO.businessLine.toLowerCase()}, bán trực tiếp tới khách hàng qua website này.`,
  sections: [
    {
      heading: "Chúng tôi làm gì",
      paragraphs: [
        `Chúng tôi sản xuất giày dép và phụ liệu dép tại xưởng của công ty ở ${STORE_INFO.address}, rồi bán trực tiếp trên website — không qua trung gian, nên giá bạn thấy là giá xưởng bán ra.`,
        "Website nhận đơn lẻ tự động: chọn size và màu còn hàng, đặt hàng, chuyển khoản theo mã đơn. Đơn số lượng lớn hoặc yêu cầu riêng thì trao đổi trực tiếp qua Zalo hoặc điện thoại.",
      ],
    },
    {
      heading: "Cách chúng tôi làm việc",
      bullets: [
        "Giá hiển thị trên trang sản phẩm là giá bán cuối cùng; phí giao hàng 30.000 ₫ áp dụng chung toàn quốc và hiện rõ trước khi bạn xác nhận đơn.",
        "Chỉ nhận thanh toán chuyển khoản qua VietQR với nội dung đúng mã đơn — hệ thống tự đối soát và gửi email xác nhận khi tiền về.",
        "Tồn kho hiển thị theo từng biến thể size × màu, hết hàng thì không cho thêm vào giỏ.",
        "Mọi đơn đều có email xác nhận; cần hỏi thêm thì liên hệ Zalo trong giờ làm việc.",
      ],
    },
    {
      heading: "Thông tin doanh nghiệp",
      bullets: [
        `Tên pháp lý: ${STORE_INFO.legalName}`,
        `Ngành nghề: ${STORE_INFO.businessLine}`,
        `Địa chỉ: ${STORE_INFO.address}`,
        `Điện thoại: ${STORE_INFO.phoneDisplay}`,
        `Email: ${STORE_INFO.email}`,
        `Giờ làm việc: ${WORKING_HOURS}`,
      ],
    },
  ],
};

export const NHA_MAY_PAGE: ContentPage = {
  href: "/nha-may",
  navLabel: "Nhà máy & hoạt động kinh doanh",
  title: "Nhà máy & hoạt động kinh doanh",
  metaDescription:
    "Xưởng sản xuất giày dép và phụ liệu dép của leafshoes Việt Nam: năng lực sản xuất, hoạt động kinh doanh và cách làm việc trực tiếp.",
  lead: `Xưởng sản xuất của ${STORE_INFO.brand} đặt tại ${STORE_INFO.address} — nơi làm ra giày dép và phụ liệu dép cho chính thương hiệu của chúng tôi.`,
  sections: [
    {
      heading: "Năng lực sản xuất",
      bullets: [
        "Tự sản xuất giày dép và phụ liệu dép, không nhập hàng bán lại.",
        "Kiểm tra từng đôi trước khi đóng gói và gửi đi.",
        "Mẫu và size theo đúng thông tin công bố trên trang sản phẩm.",
        "Số lượng còn lại của từng size và màu được cập nhật trực tiếp trên website.",
      ],
    },
    {
      heading: "Hoạt động kinh doanh",
      bullets: [
        "Bán lẻ trực tuyến trên website, giao hàng tới 34 tỉnh thành.",
        "Nhận đơn số lượng lớn và yêu cầu gia công — liên hệ điện thoại hoặc Zalo để trao đổi mẫu, số lượng và thời gian.",
        "Đóng gói và gửi hàng trực tiếp từ xưởng sau khi xác nhận thanh toán.",
      ],
    },
    {
      heading: "Làm việc trực tiếp tại xưởng",
      paragraphs: [
        `Bạn có thể tới xem hàng và làm việc trực tiếp tại xưởng trong giờ làm việc (${WORKING_HOURS}). Vui lòng gọi trước theo số ${STORE_INFO.phoneDisplay} để chúng tôi chuẩn bị đúng mẫu và size bạn cần.`,
      ],
    },
  ],
};

export const CHI_NHANH_PAGE: ContentPage = {
  href: "/chi-nhanh",
  navLabel: "Chi nhánh",
  title: "Chi nhánh",
  metaDescription:
    "Địa chỉ trụ sở và xưởng sản xuất của leafshoes Việt Nam, giờ làm việc và khu vực giao hàng.",
  lead: `Hiện ${STORE_INFO.brand} có một địa điểm duy nhất: trụ sở đặt cùng xưởng sản xuất. Mọi đơn hàng trên website đều được đóng gói và gửi đi từ đây.`,
  sections: [
    {
      heading: "Trước khi tới",
      paragraphs: [
        "Xưởng không phải cửa hàng trưng bày, nên hãy gọi trước để chúng tôi chuẩn bị mẫu và size bạn muốn xem. Nếu chỉ cần mua nhanh, đặt trên website vẫn tiện hơn vì tồn kho từng size đã hiển thị sẵn.",
      ],
    },
    {
      heading: "Khu vực phục vụ",
      paragraphs: [
        "Chúng tôi giao hàng tới 34 tỉnh thành trong danh sách hiện ra khi bạn đặt hàng, phí giao hàng 30.000 ₫ cho mọi đơn và mọi tỉnh.",
      ],
    },
  ],
};

export const COMPANY_PAGES = [GIOI_THIEU_PAGE, NHA_MAY_PAGE, CHI_NHANH_PAGE] as const;

export const COMPANY_NAV = toNavItems(COMPANY_PAGES);

export const COMPANY_NAV_LABEL = "Tổng quan doanh nghiệp" as const;
