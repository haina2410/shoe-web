// @vitest-environment node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { testPrisma as db } from "@/test/db";
const exec = promisify(execFile);
let dir: string;
let ownerId: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "catalog-cli-"));
  ownerId = crypto.randomUUID();
  await db.user.create({
    data: {
      id: ownerId,
      name: "CLI owner",
      email: `${ownerId}@catalog-cli.test`,
      role: "owner",
    },
  });
});
afterEach(async () => {
  await db.user.delete({ where: { id: ownerId } });
  await rm(dir, { recursive: true, force: true });
});
function run(...args: string[]) {
  return exec(
    process.execPath,
    ["--import", "tsx", "scripts/catalog-api.ts", ...args],
    { env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST } },
  );
}
it("issues a credential into a private file, lists metadata, and revokes it", async () => {
  const output = path.join(dir, "credential.json");
  const issued = await run(
    "issue",
    "--owner-email",
    `${ownerId}@catalog-cli.test`,
    "--name",
    "Supplier import",
    "--days",
    "7",
    "--scopes",
    "catalog:read,products:create,images:write",
    "--out",
    output,
  );
  const credential = JSON.parse(await readFile(output, "utf8"));
  expect(credential.token).toMatch(/^shoe_/);
  expect(issued.stdout).not.toContain(credential.token);
  expect((await stat(output)).mode & 0o777).toBe(0o600);
  const listed = await run("list");
  expect(listed.stdout).toContain(credential.id);
  expect(listed.stdout).not.toContain(credential.token);
  await run("revoke", "--id", credential.id);
  expect(
    (
      await db.catalogApiToken.findUniqueOrThrow({
        where: { id: credential.id },
      })
    ).revokedAt,
  ).not.toBeNull();
});
it("does not overwrite an existing credential file", async () => {
  const output = path.join(dir, "credential.json");
  const args = [
    "issue",
    "--owner-email",
    `${ownerId}@catalog-cli.test`,
    "--name",
    "test",
    "--out",
    output,
  ];
  await run(...args);
  const original = await readFile(output, "utf8");
  await expect(run(...args)).rejects.toMatchObject({ code: 1 });
  expect(await readFile(output, "utf8")).toBe(original);
  expect(
    await db.catalogApiToken.count({ where: { ownerId, revokedAt: null } }),
  ).toBe(1);
});
