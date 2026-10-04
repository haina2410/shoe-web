import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CatalogApiError } from "./errors";
import { authenticateCatalogRequest, type CatalogScope } from "./tokens";

export async function readBoundedBody(
  request: Request,
  limit: number,
): Promise<Buffer> {
  if (request.headers.has("content-encoding"))
    throw new CatalogApiError(
      415,
      "UNSUPPORTED_ENCODING",
      "Compressed request bodies are not accepted",
    );
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit))
    throw new CatalogApiError(
      413,
      "BODY_TOO_LARGE",
      "Request body exceeds the limit",
    );
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 15000);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut)
        throw new CatalogApiError(
          408,
          "BODY_TIMEOUT",
          "Request body timed out",
        );
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        void reader.cancel().catch(() => undefined);
        throw new CatalogApiError(
          413,
          "BODY_TOO_LARGE",
          "Request body exceeds the limit",
        );
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, total);
  } catch (error) {
    if (error instanceof CatalogApiError) throw error;
    throw new CatalogApiError(
      400,
      "INVALID_BODY",
      "Could not read request body",
    );
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
export async function readCatalogJson(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new CatalogApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Use application/json",
    );
  const bytes = await readBoundedBody(request, 256 * 1024);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new CatalogApiError(400, "INVALID_JSON", "Invalid JSON body");
  }
}

type ApiResult = {
  data: unknown;
  status?: number;
  replayed?: boolean;
  nextCursor?: string | null;
};
export async function handleCatalogRequest(
  request: Request,
  scope: CatalogScope,
  operation: string,
  handler: (token: { id: string; ownerId: string }) => Promise<ApiResult>,
) {
  const requestId = randomUUID();
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
  });
  let tokenId: string | undefined;
  let resourceId: string | undefined;
  let status = 500;
  let code: string | undefined;
  try {
    const protocol =
      request.headers.get("x-forwarded-proto") ??
      new URL(request.url).protocol.replace(":", "");
    if (process.env.NODE_ENV === "production" && protocol !== "https")
      throw new CatalogApiError(400, "HTTPS_REQUIRED", "HTTPS is required");
    const token = await authenticateCatalogRequest(prisma, request, scope);
    tokenId = token.id;
    const { status: responseStatus = 200, ...body } = await handler(token);
    status = responseStatus;
    if (
      body.data &&
      typeof body.data === "object" &&
      "id" in body.data &&
      typeof body.data.id === "string"
    )
      resourceId = body.data.id;
    return Response.json({ ...body, requestId }, { status, headers });
  } catch (error) {
    if (error instanceof CatalogApiError) {
      status = error.status;
      code = error.code;
      if (status === 401) headers.set("WWW-Authenticate", "Bearer");
      if (status === 429) headers.set("Retry-After", "60");
      return Response.json(
        { error: { code, message: error.message }, requestId },
        { status, headers },
      );
    }
    if (error instanceof z.ZodError) {
      status = 422;
      code = "VALIDATION_ERROR";
      return Response.json(
        {
          error: {
            code,
            message: "Invalid request fields",
            issues: error.issues.map((issue) => ({
              path: issue.path,
              code: issue.code,
            })),
          },
          requestId,
        },
        { status, headers },
      );
    }
    code = "INTERNAL_ERROR";
    return Response.json(
      {
        error: {
          code,
          message:
            "Request failed; reconcile or retry with the same idempotency key",
        },
        requestId,
      },
      { status, headers },
    );
  } finally {
    console.info(
      JSON.stringify({
        event: "catalog_api",
        requestId,
        tokenId,
        operation,
        resourceId,
        status,
        code,
      }),
    );
  }
}
