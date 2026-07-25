import { render } from "react-email";
import {
  OrderConfirmationEmail,
  type OrderConfirmationEmailProps,
} from "@/emails/order-confirmation";

/** Kết quả render sẵn sàng để gửi qua `Mailer` (`src/lib/mailer.ts`). */
export type RenderedOrderConfirmationEmail = {
  subject: string;
  html: string;
  text: string;
};

/**
 * Render `OrderConfirmationEmail` thành `{ subject, html, text }`. Tách
 * riêng khỏi file component (`.tsx`) để nơi gọi không phải JSX (worker,
 * Task 2–4) vẫn import được mà không cần bundler xử lý JSX.
 */
export async function renderOrderConfirmationEmail(
  props: OrderConfirmationEmailProps,
): Promise<RenderedOrderConfirmationEmail> {
  const element = OrderConfirmationEmail(props);

  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);

  return {
    subject: `Đơn hàng ${props.orderCode} — leafshoes Việt Nam`,
    html,
    text,
  };
}
