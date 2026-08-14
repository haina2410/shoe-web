import { afterEach, describe, expect, test } from "vitest";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const releaseScript = path.join(scriptDirectory, "release");
const temporaryDirectories: string[] = [];

function git(repository: string, ...arguments_: string[]) {
  return execFileSync("git", arguments_, {
    cwd: repository,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function createRepository() {
  const root = mkdtempSync(path.join(tmpdir(), "leafshoes-release-"));
  const origin = path.join(root, "origin.git");
  const repository = path.join(root, "repository");
  const binaryDirectory = path.join(root, "bin");
  const ghLog = path.join(root, "gh.log");
  temporaryDirectories.push(root);

  execFileSync("mkdir", ["-p", binaryDirectory]);
  execFileSync("git", ["init", "--bare", origin], { stdio: "ignore" });
  execFileSync("git", ["init", "-b", "main", repository], { stdio: "ignore" });
  git(repository, "config", "user.name", "Release Test");
  git(repository, "config", "user.email", "release@example.com");
  writeFileSync(path.join(repository, "version.txt"), "first\n");
  git(repository, "add", "version.txt");
  git(repository, "commit", "-m", "First release");
  git(repository, "remote", "add", "origin", origin);
  git(repository, "push", "-u", "origin", "main");

  const fakeGh = path.join(binaryDirectory, "gh");
  writeFileSync(
    fakeGh,
    '#!/bin/sh\nif [ "$1" = "release" ] && [ "$2" = "view" ]; then exit 1; fi\nprintf \'%s\\n\' "$@" > "$GH_LOG"\n',
  );
  chmodSync(fakeGh, 0o755);

  return {
    origin,
    repository,
    ghLog,
    environment: {
      ...process.env,
      PATH: `${binaryDirectory}:${process.env.PATH}`,
      GH_LOG: ghLog,
    },
  };
}

function runRelease(repository: string, environment: NodeJS.ProcessEnv) {
  return spawnSync(releaseScript, [], {
    cwd: repository,
    env: environment,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("script/release", () => {
  test("creates the first release from the latest main commit", () => {
    const fixture = createRepository();
    const releaseCommit = git(fixture.repository, "rev-parse", "HEAD");
    const releaseHash = releaseCommit.slice(0, 7);
    const releaseTag = `leafshoes-${releaseHash}`;

    const result = runRelease(fixture.repository, fixture.environment);

    expect(result.status).toBe(0);
    expect(git(fixture.repository, "cat-file", "-t", `refs/tags/${releaseTag}`)).toBe(
      "tag",
    );
    expect(
      git(fixture.origin, "show-ref", "--verify", `refs/tags/${releaseTag}`),
    ).toContain(releaseTag);
    expect(readFileSync(fixture.ghLog, "utf8").trim().split("\n")).toEqual([
      "release",
      "create",
      releaseTag,
      "--verify-tag",
      "--generate-notes",
      "--title",
      `Leaf Shoes - ${releaseHash}`,
    ]);
  });

  test("generates notes from the preceding release tag", () => {
    const fixture = createRepository();
    const previousCommit = git(fixture.repository, "rev-parse", "HEAD");
    const previousHash = previousCommit.slice(0, 7);
    const previousTag = `leafshoes-${previousHash}`;
    git(fixture.repository, "tag", "-a", previousTag, "-m", `Leaf Shoes - ${previousHash}`);
    git(fixture.repository, "push", "origin", previousTag);
    writeFileSync(path.join(fixture.repository, "version.txt"), "second\n");
    git(fixture.repository, "add", "version.txt");
    git(fixture.repository, "commit", "-m", "Second release");
    git(fixture.repository, "push", "origin", "main");
    const releaseCommit = git(fixture.repository, "rev-parse", "HEAD");
    const releaseHash = releaseCommit.slice(0, 7);
    const releaseTag = `leafshoes-${releaseHash}`;

    const result = runRelease(fixture.repository, fixture.environment);

    expect(result.status).toBe(0);
    expect(readFileSync(fixture.ghLog, "utf8").trim().split("\n")).toEqual([
      "release",
      "create",
      releaseTag,
      "--verify-tag",
      "--generate-notes",
      "--title",
      `Leaf Shoes - ${releaseHash}`,
      "--notes-start-tag",
      previousTag,
    ]);
  });

  test("refuses to overwrite an existing release tag", () => {
    const fixture = createRepository();
    const releaseCommit = git(fixture.repository, "rev-parse", "HEAD");
    const releaseTag = `leafshoes-${releaseCommit.slice(0, 7)}`;
    expect(runRelease(fixture.repository, fixture.environment).status).toBe(0);

    const result = runRelease(fixture.repository, fixture.environment);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Release tag already exists: ${releaseTag}`);
  });

  test("refuses a checkout behind the latest main commit", () => {
    const fixture = createRepository();
    const checkoutCommit = git(fixture.repository, "rev-parse", "HEAD");
    writeFileSync(path.join(fixture.repository, "version.txt"), "second\n");
    git(fixture.repository, "add", "version.txt");
    git(fixture.repository, "commit", "-m", "Second release");
    git(fixture.repository, "push", "origin", "main");
    const latestCommit = git(fixture.repository, "rev-parse", "HEAD");
    git(fixture.repository, "checkout", "--detach", checkoutCommit);

    const result = runRelease(fixture.repository, fixture.environment);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `Checkout does not match latest main commit: HEAD=${checkoutCommit} origin/main=${latestCommit}`,
    );
    expect(git(fixture.origin, "tag", "--list", latestCommit)).toBe("");
  });
});
