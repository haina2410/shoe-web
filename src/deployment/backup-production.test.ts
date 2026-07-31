import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type HarnessOptions = {
  dockerFailure?: "dump" | "archive";
  mvFailure?: "uploads";
};

function createBackupHarness({
  dockerFailure = "",
  mvFailure = "",
}: HarnessOptions = {}) {
  const testRoot = mkdtempSync(join(tmpdir(), "leafshoes-backup-test-"));
  const fakeBin = join(testRoot, "bin");
  const backupDir = join(testRoot, "backups");
  const dockerState = join(testRoot, "docker-state");
  const timestamp = "20260731T123456Z";
  mkdirSync(fakeBin);

  const fakeDate = join(fakeBin, "date");
  writeFileSync(
    fakeDate,
    `#!/usr/bin/env bash
printf '%s\\n' "\${FAKE_TIMESTAMP:?}"
`,
  );
  chmodSync(fakeDate, 0o755);

  const fakeMv = join(fakeBin, "mv");
  writeFileSync(
    fakeMv,
    `#!/usr/bin/env bash
set -Eeuo pipefail

destination="\${@: -1}"
if [[ "\${FAKE_MV_FAILURE:-}" == "uploads" ]] &&
  [[ "$destination" == *"/uploads-"* ]]; then
  exit 25
fi
exec /bin/mv "$@"
`,
  );
  chmodSync(fakeMv, 0o755);

  const fakeDocker = join(fakeBin, "docker");
  writeFileSync(
    fakeDocker,
    `#!/usr/bin/env bash
set -Eeuo pipefail

if [[ " $* " == *" exec -T postgres "* ]]; then
  if [[ -e "\${FAKE_DOCKER_STATE:?}" ]]; then
    generation=second
  else
    generation=first
  fi
  printf '%s\\n' "$generation" >"$FAKE_DOCKER_STATE"
  printf 'database-%s\\n' "$generation"
  if [[ "\${FAKE_DOCKER_FAILURE:-}" == "dump" ]]; then
    exit 23
  fi
elif [[ " $* " == *" run --rm --no-deps "* ]] &&
  [[ " $* " == *" --entrypoint tar "* ]]; then
  generation="$(<"$FAKE_DOCKER_STATE")"
  printf 'uploads-%s\\n' "$generation"
  if [[ "\${FAKE_DOCKER_FAILURE:-}" == "archive" ]]; then
    exit 24
  fi
else
  printf 'Unexpected docker invocation: %s\\n' "$*" >&2
  exit 64
fi
`,
  );
  chmodSync(fakeDocker, 0o755);

  const env = {
    PATH: `${fakeBin}:${process.env.PATH}`,
    BACKUP_DIR: backupDir,
    POSTGRES_DB: "leafshoes",
    POSTGRES_USER: "leafshoes",
    FAKE_TIMESTAMP: timestamp,
    FAKE_DOCKER_STATE: dockerState,
    FAKE_DOCKER_FAILURE: dockerFailure,
    FAKE_MV_FAILURE: mvFailure,
  };

  return {
    backupDir,
    timestamp,
    cleanup: () => rmSync(testRoot, { recursive: true, force: true }),
    runBackup: () =>
      spawnSync("bash", ["scripts/backup-production.sh"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env,
      }),
  };
}

describe("production backup", () => {
  it("creates private artifacts and fails closed on a timestamp collision", () => {
    const harness = createBackupHarness();

    try {
      const { backupDir, runBackup, timestamp } = harness;
      const first = runBackup();
      const dbFile = join(backupDir, `postgres-${timestamp}.dump`);
      const uploadsFile = join(backupDir, `uploads-${timestamp}.tar.gz`);
      const initial = {
        dbContents: readFileSync(dbFile, "utf8"),
        dbMode: statSync(dbFile).mode & 0o777,
        uploadsContents: readFileSync(uploadsFile, "utf8"),
        uploadsMode: statSync(uploadsFile).mode & 0o777,
      };

      const second = runBackup();
      const final = {
        dbContents: readFileSync(dbFile, "utf8"),
        uploadsContents: readFileSync(uploadsFile, "utf8"),
      };

      expect({
        firstStatus: first.status,
        initial,
        secondStatus: second.status,
        final,
      }).toEqual({
        firstStatus: 0,
        initial: {
          dbContents: "database-first\n",
          dbMode: 0o600,
          uploadsContents: "uploads-first\n",
          uploadsMode: 0o600,
        },
        secondStatus: 1,
        final: {
          dbContents: "database-first\n",
          uploadsContents: "uploads-first\n",
        },
      });
    } finally {
      harness.cleanup();
    }
  });

  it("removes partial output when the database dump fails", () => {
    const harness = createBackupHarness({ dockerFailure: "dump" });

    try {
      const result = harness.runBackup();

      expect({
        status: result.status,
        backupFiles: readdirSync(harness.backupDir),
      }).toEqual({
        status: 23,
        backupFiles: [],
      });
    } finally {
      harness.cleanup();
    }
  });

  it("removes partial output when the uploads archive fails", () => {
    const harness = createBackupHarness({ dockerFailure: "archive" });

    try {
      const result = harness.runBackup();

      expect({
        status: result.status,
        backupFiles: readdirSync(harness.backupDir),
      }).toEqual({
        status: 24,
        backupFiles: [],
      });
    } finally {
      harness.cleanup();
    }
  });

  it("removes the published database file when the archive rename fails", () => {
    const harness = createBackupHarness({ mvFailure: "uploads" });

    try {
      const result = harness.runBackup();

      expect({
        status: result.status,
        backupFiles: readdirSync(harness.backupDir),
      }).toEqual({
        status: 25,
        backupFiles: [],
      });
    } finally {
      harness.cleanup();
    }
  });
});
