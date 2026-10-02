import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(projectRoot, "dist");
if (relative(projectRoot, output) !== "dist")
  throw new Error("Invalid build output path");
await rm(output, { recursive: true, force: true });
for (const command of [
  ["node_modules/vite/bin/vite.js", "build"],
  ["scripts/create-offline.mjs"],
  [
    "node_modules/vite/bin/vite.js",
    "build",
    "--config",
    "vite.worker.config.ts",
  ],
]) {
  const result = spawnSync(process.execPath, command, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
