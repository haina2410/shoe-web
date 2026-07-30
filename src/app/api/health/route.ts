import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { status: 200, headers });
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers },
    );
  }
}
