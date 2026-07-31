import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export function copyStandaloneAssets(projectRoot = process.cwd()) {
  const standaloneRoot = resolve(projectRoot, ".next", "standalone");

  for (const [source, destination] of [
    [resolve(projectRoot, "public"), resolve(standaloneRoot, "public")],
    [
      resolve(projectRoot, ".next", "static"),
      resolve(standaloneRoot, ".next", "static"),
    ],
  ]) {
    if (existsSync(source)) {
      cpSync(source, destination, { recursive: true });
    }
  }

  return standaloneRoot;
}

const isDirect =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  const standaloneRoot = copyStandaloneAssets();
  const server = spawn(process.execPath, ["server.js"], {
    cwd: standaloneRoot,
    env: process.env,
    stdio: "inherit",
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.kill(signal));
  }

  server.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  server.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
