import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRawMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: queryRawMock },
}));

import { GET, dynamic } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns non-cacheable 200 when the database is ready", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();

    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });

  it("returns a generic non-cacheable 503 without leaking database errors", async () => {
    queryRawMock.mockRejectedValue(
      new Error("password=do-not-leak host=private-db"),
    );

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toBe('{"status":"unavailable"}');
    expect(body).not.toContain("do-not-leak");
    expect(body).not.toContain("private-db");
  });
});
