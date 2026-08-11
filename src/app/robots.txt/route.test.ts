import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/robots.txt/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /robots.txt", () => {
  it("allows crawling only when the runtime policy is allow", async () => {
    vi.stubEnv("CRAWL_POLICY", "allow");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=3600",
    );
    expect(await response.text()).toBe("User-agent: *\nAllow: /\n");
  });

  it.each(["disallow", "invalid", undefined])(
    "blocks crawling when the runtime policy is %s",
    async (policy) => {
      vi.stubEnv("CRAWL_POLICY", policy);

      const response = await GET();

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("User-agent: *\nDisallow: /\n");
    },
  );
});
