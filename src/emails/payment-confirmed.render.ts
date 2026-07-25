import { render } from "react-email";
import {
  PaymentConfirmedEmail,
  type PaymentConfirmedEmailProps,
} from "@/emails/payment-confirmed";

export type RenderedPaymentConfirmedEmail = {
  subject: string;
  html: string;
  text: string;
};

export async function renderPaymentConfirmedEmail(
  props: PaymentConfirmedEmailProps,
): Promise<RenderedPaymentConfirmedEmail> {
  const element = PaymentConfirmedEmail(props);
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);

  return {
    subject: `Đã nhận thanh toán đơn hàng ${props.orderCode} — leafshoes Việt Nam`,
    html,
    text,
  };
}
