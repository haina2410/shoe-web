import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Text,
} from "react-email";
import { formatVnd } from "@/lib/money";

/** Một dòng sản phẩm trong đơn hàng, hiển thị trong bảng của email. */
export type OrderConfirmationEmailItem = {
  productName: string;
  size: string;
  color: string;
  unitPrice: number;
  quantity: number;
};

export type OrderConfirmationEmailProps = {
  orderCode: string;
  customerName: string;
  items: OrderConfirmationEmailItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  address: { province: string; ward: string; addressLine: string };
  qrImageUrl: string;
  bank: { bankCode: string; accountNo: string; accountName: string };
  orderUrl: string;
};

/**
 * Email xác nhận đơn hàng gửi cho khách sau khi đặt hàng thành công (Ngày 6).
 * Nội dung khớp với trang `/orders/[orderCode]` (Ngày 5) — cùng cách hiển thị
 * QR/ngân hàng/tổng tiền — nhưng KHÔNG tự dựng URL ảnh QR: `qrImageUrl` được
 * truyền vào từ nơi gọi (worker, Task 3), template chỉ hiển thị.
 */
export function OrderConfirmationEmail(props: OrderConfirmationEmailProps) {
  const { orderCode, customerName, items, subtotal, shippingFee, total, address, qrImageUrl, bank, orderUrl } =
    props;

  return (
    <Html lang="vi">
      <Head />
      <Preview>Đơn hàng {orderCode} đã được ghi nhận — vui lòng thanh toán để hoàn tất</Preview>
      <Body style={{ backgroundColor: "#f4f4f4", fontFamily: "Arial, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "24px", maxWidth: "600px" }}>
          <Heading as="h1" style={{ color: "#0b3d2e", fontSize: "20px" }}>
            Cảm ơn bạn đã đặt hàng tại leafshoes Việt Nam!
          </Heading>

          <Text>
            Xin chào {customerName}, đơn hàng của bạn đã được ghi nhận. Mã đơn hàng của bạn là{" "}
            <strong>{orderCode}</strong>.
          </Text>

          <Hr />

          <Heading as="h2" style={{ fontSize: "16px", color: "#0b3d2e" }}>
            Chi tiết đơn hàng
          </Heading>

          {items.map((item, index) => (
            <Row key={`${item.productName}-${item.size}-${item.color}-${index}`} style={{ marginBottom: "8px" }}>
              <Column>
                <Text style={{ margin: 0, fontWeight: "bold" }}>{item.productName}</Text>
                <Text style={{ margin: 0, color: "#666666", fontSize: "13px" }}>
                  Size {item.size} / Màu {item.color} × {item.quantity}
                </Text>
              </Column>
              <Column align="right">
                <Text style={{ margin: 0 }}>{formatVnd(item.unitPrice * item.quantity)}</Text>
              </Column>
            </Row>
          ))}

          <Hr />

          <Row>
            <Column>
              <Text style={{ margin: 0, color: "#666666" }}>Tạm tính</Text>
            </Column>
            <Column align="right">
              <Text style={{ margin: 0 }}>{formatVnd(subtotal)}</Text>
            </Column>
          </Row>
          <Row>
            <Column>
              <Text style={{ margin: 0, color: "#666666" }}>Phí vận chuyển</Text>
            </Column>
            <Column align="right">
              <Text style={{ margin: 0 }}>{formatVnd(shippingFee)}</Text>
            </Column>
          </Row>
          <Row>
            <Column>
              <Text style={{ margin: 0, fontWeight: "bold" }}>Tổng cộng</Text>
            </Column>
            <Column align="right">
              <Text style={{ margin: 0, fontWeight: "bold" }}>{formatVnd(total)}</Text>
            </Column>
          </Row>

          <Hr />

          <Heading as="h2" style={{ fontSize: "16px", color: "#0b3d2e" }}>
            Địa chỉ giao hàng
          </Heading>
          <Text>
            {address.addressLine}, {address.ward}, {address.province}
          </Text>

          <Hr />

          <Heading as="h2" style={{ fontSize: "16px", color: "#0b3d2e" }}>
            Thanh toán bằng VietQR
          </Heading>
          <Text>Quét mã QR bên dưới bằng ứng dụng ngân hàng để thanh toán:</Text>
          <Img
            src={qrImageUrl}
            alt="Mã QR chuyển khoản VietQR"
            width="240"
            style={{ borderRadius: "8px", border: "1px solid #e0e0e0" }}
          />

          <Text style={{ margin: "4px 0" }}>
            Ngân hàng: <strong>{bank.bankCode}</strong>
          </Text>
          <Text style={{ margin: "4px 0" }}>
            Số tài khoản: <strong>{bank.accountNo}</strong>
          </Text>
          <Text style={{ margin: "4px 0" }}>
            Chủ tài khoản: <strong>{bank.accountName}</strong>
          </Text>
          <Text style={{ margin: "12px 0 4px", color: "#b3261e", fontWeight: "bold" }}>
            Vui lòng ghi đúng nội dung chuyển khoản: {orderCode}
          </Text>

          <Hr />

          <Text>
            Xem chi tiết đơn hàng tại: <Link href={orderUrl}>{orderUrl}</Link>
          </Text>

          <Text style={{ color: "#999999", fontSize: "12px" }}>
            Đây là email tự động từ leafshoes Việt Nam, vui lòng không trả lời email này.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
