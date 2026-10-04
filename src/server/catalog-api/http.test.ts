// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readBoundedBody, readCatalogJson } from "./http";
describe("catalog request bodies", () => {
  it("rejects oversized streams even without Content-Length", async () => {
    const request = new Request("https://shop.test", {
      method: "POST",
      body: "12345",
    });
    await expect(readBoundedBody(request, 4)).rejects.toMatchObject({
      status: 413,
    });
  });
  it("rejects dishonest Content-Length and encoded bodies", async () => {
    await expect(
      readBoundedBody(
        new Request("https://shop.test", {
          method: "POST",
          headers: { "content-length": "1" },
          body: "12345",
        }),
        4,
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readBoundedBody(
        new Request("https://shop.test", {
          method: "POST",
          headers: { "content-encoding": "gzip" },
          body: "123",
        }),
        4,
      ),
    ).rejects.toMatchObject({ status: 415 });
  });
  it("returns valid JSON and rejects unsupported or malformed payloads", async () => {
    expect(
      await readCatalogJson(
        new Request("https://shop.test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"ok":true}',
        }),
      ),
    ).toEqual({ ok: true });
    await expect(
      readCatalogJson(
        new Request("https://shop.test", { method: "POST", body: "{}" }),
      ),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readCatalogJson(
        new Request("https://shop.test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
