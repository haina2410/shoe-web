import { getBoss } from "@/jobs/queue";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  sePayWebhookPayloadSchema,
  verifySePaySignature,
} from "@/lib/sepay";
import {
  persistSePayEventCore,
  reconcilePersistedSePayEventCore,
} from "@/server/payments/reconcile-sepay";

export const runtime = "nodejs";

type FailureCategory =
  | "authentication"
  | "configuration"
  | "infrastructure"
  | "validation";

type FailureReason =
  | "account-mismatch"
  | "body-read-failed"
  | "invalid-payload"
  | "invalid-signature"
  | "malformed-json"
  | "missing-account-config"
  | "processing-failed";

function failure(
  status: 400 | 401 | 500,
  category: FailureCategory,
  reason: FailureReason,
): Response {
  console.error(
    `[sepay-webhook] operation=receive category=${category} reason=${reason} status=${status}`,
  );
  return Response.json({ success: false }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return failure(400, "validation", "body-read-failed");
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
  if (!signatureIsValid) {
    return failure(401, "authentication", "invalid-signature");
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return failure(400, "validation", "malformed-json");
  }

  const parsed = sePayWebhookPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return failure(400, "validation", "invalid-payload");
  }

  const expectedAccount = process.env.VIETQR_ACCOUNT_NO?.trim();
  if (!expectedAccount) {
    return failure(400, "configuration", "missing-account-config");
  }

  const accountMatches = parsed.data.accountNumber.trim() === expectedAccount;
  const subAccountMatches = parsed.data.subAccount?.trim() === expectedAccount;
  if (!accountMatches && !subAccountMatches) {
    return failure(400, "validation", "account-mismatch");
  }

  try {
    const event = await persistSePayEventCore(
      prisma,
      parsed.data,
      json as Prisma.InputJsonValue,
    );
    if (event.status !== "RECEIVED") {
      return Response.json({ success: true }, { status: 200 });
    }

    await getBoss();
    await reconcilePersistedSePayEventCore(prisma, event.id);
    return Response.json({ success: true }, { status: 200 });
  } catch {
    return failure(500, "infrastructure", "processing-failed");
  }
}
