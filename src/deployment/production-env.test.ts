import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_PRODUCTION_ENV,
  validateProductionEnv,
} from "../../scripts/validate-production-env.mjs";

describe("production environment validation", () => {
  it("returns only missing variable names in stable order", () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      ...Object.fromEntries(
        REQUIRED_PRODUCTION_ENV.map((name) => [name, `${name}-value`]),
      ),
      CRAWL_POLICY: "allow",
    };
    delete env.POSTGRES_PASSWORD;
    delete env.BOT_TOKEN;
    delete env.SEPAY_WEBHOOK_SECRET;

    expect(validateProductionEnv(env)).toEqual([
      "POSTGRES_PASSWORD",
      "BOT_TOKEN",
      "SEPAY_WEBHOOK_SECRET",
    ]);
  });

  it("rejects a crawler policy that would block production", () => {
    const env: NodeJS.ProcessEnv = Object.fromEntries(
      REQUIRED_PRODUCTION_ENV.map((name) => [name, `${name}-value`]),
    );
    env.CRAWL_POLICY = "disallow";

    expect(validateProductionEnv(env)).toEqual(["CRAWL_POLICY"]);
  });

  it("CLI never echoes present secret values when validation fails", () => {
    const secret = "must-not-appear-in-output";
    const botToken = "bot-token-must-not-appear-in-output";
    const result = spawnSync(
      process.execPath,
      ["scripts/validate-production-env.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          NODE_ENV: "test",
          PATH: process.env.PATH,
          POSTGRES_PASSWORD: secret,
          BOT_TOKEN: botToken,
        },
      },
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
    expect(`${result.stdout}${result.stderr}`).not.toContain(botToken);
    expect(result.stderr).toContain("POSTGRES_DB");
  });
});
