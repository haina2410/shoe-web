import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import playwrightConfig from "../../playwright.config";
import { copyStandaloneAssets } from "../../scripts/start-standalone.mjs";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("local standalone E2E runtime", () => {
  it("pins Next tracing and Turbopack to the current project", () => {
    expect(nextConfig.output).toBe("standalone");
    expect(nextConfig.outputFileTracingRoot).toBe(process.cwd());
    expect(nextConfig.turbopack?.root).toBe(process.cwd());
  });

  it("keeps production smoke out of the browser E2E suite and starts standalone", () => {
    expect(playwrightConfig.testIgnore).toContain("**/production-smoke.spec.ts");
    expect(playwrightConfig.webServer).toMatchObject({
      command: "npm run build && node scripts/start-standalone.mjs",
      url: "http://localhost:3000",
    });
  });

  it("copies public and Next static assets beside the standalone server", () => {
    const root = mkdtempSync(join(tmpdir(), "leafshoes-standalone-"));
    directories.push(root);

    mkdirSync(join(root, "public"), { recursive: true });
    mkdirSync(join(root, ".next", "static", "chunks"), { recursive: true });
    mkdirSync(join(root, ".next", "standalone"), { recursive: true });
    writeFileSync(join(root, "public", "logo.txt"), "public asset");
    writeFileSync(join(root, ".next", "static", "chunks", "app.js"), "static asset");

    copyStandaloneAssets(root);

    expect(readFileSync(join(root, ".next", "standalone", "public", "logo.txt"), "utf8")).toBe("public asset");
    expect(
      readFileSync(
        join(root, ".next", "standalone", ".next", "static", "chunks", "app.js"),
        "utf8",
      ),
    ).toBe("static asset");
  });
});
