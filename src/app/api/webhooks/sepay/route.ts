import { getBoss } from "@/jobs/queue";
import { prisma } from "@/lib/prisma";
import {
  sePayWebhookPayloadSchema,
  verifySePaySignature,
} from "@/lib/sepay";
import { reconcileSePayCore } from "@/server/payments/reconcile-sepay";

export const runtime = "nodejs";

function failure(status: 400 | 401 | 500): Response {
  return Response.json({ success: false }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return failure(400);
  }

  const signatureHeader = request.headers.get("x-sepay-signature");
  const signature = signatureHeader?.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : null;
  const signatureIsValid = verifySePaySignature({
    rawBody,
    signature,
    timestamp: request.headers.get("x-sepay-timestamp"),
    secret: process.env.SEPAY_WEBHOOK_SECRET ?? "",
  });
  if (!signatureIsValid) return failure(401);

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return failure(400);
  }

  const parsed = sePayWebhookPayloadSchema.safeParse(json);
  if (!parsed.success) return failure(400);

  const expectedAccount = process.env.VIETQR_ACCOUNT_NO?.trim();
  if (
    !expectedAccount ||
    parsed.data.accountNumber.trim() !== expectedAccount
  ) {
    return failure(400);
  }

  try {
    await getBoss();
    await reconcileSePayCore(prisma, parsed.data);
    return Response.json({ success: true }, { status: 200 });
  } catch {
    return failure(500);
  }
}
