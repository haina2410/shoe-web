import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Text,
} from "react-email";
import { formatVnd } from "@/lib/money";

export type PaymentConfirmedEmailItem = {
  productName: string;
  size: string;
  color: string;
  unitPrice: number;
  quantity: number;
};

export type PaymentConfirmedEmailProps = {
  orderCode: string;
  customerName: string;
  items: PaymentConfirmedEmailItem[];
  total: number;
  orderUrl: string;
};

/** Email cho khách sau khi cửa hàng ghi nhận tiền của đơn hàng. */
export function PaymentConfirmedEmail({
  orderCode,
  customerName,
  items,
  total,
  orderUrl,
}: PaymentConfirmedEmailProps) {
  return (
    <Html lang="vi">
      <Head />
      <Preview>Đơn hàng {orderCode} đã nhận thanh toán</Preview>
      <Body style={{ backgroundColor: "#f4f4f4", fontFamily: "Arial, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "24px", maxWidth: "600px" }}>
          <Heading as="h1" style={{ color: "#0b3d2e", fontSize: "20px" }}>
            leafshoes Việt Nam đã nhận thanh toán
          </Heading>
          <Text>
            Xin chào {customerName}, chúng tôi đã nhận thanh toán cho đơn hàng{" "}
            <strong>{orderCode}</strong>.
          </Text>
          <Text>Cửa hàng sẽ sớm xử lý và chuẩn bị đơn hàng của bạn.</Text>

          <Hr />

          {items.map((item, index) => (
            <Row key={`${item.productName}-${item.size}-${item.color}-${index}`}>
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
              <Text style={{ margin: 0, fontWeight: "bold" }}>Tổng đã thanh toán</Text>
            </Column>
            <Column align="right">
              <Text style={{ margin: 0, fontWeight: "bold" }}>{formatVnd(total)}</Text>
            </Column>
          </Row>

          <Text>
            Xem chi tiết đơn hàng tại: <Link href={orderUrl}>{orderUrl}</Link>
          </Text>
          <Text style={{ color: "#999999", fontSize: "12px" }}>
            Đây là email tự động từ leafshoes Việt Nam.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
