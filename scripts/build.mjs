import { spawnSync } from "node:child_process";
for (const command of [
  ["node_modules/vite/bin/vite.js", "build"],
  ["scripts/create-offline.mjs"],
]) {
  const result = spawnSync(process.execPath, command, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
