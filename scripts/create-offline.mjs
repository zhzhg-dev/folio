import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { coreAssets, serviceWorkerSource } from "./offline-shell.mjs";
const output = path.resolve("dist");
await fs.access(path.join(output, "index.html"));
async function list(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries
        .filter(
          (e) =>
            !e.name.startsWith(".") &&
            ![
              "sw.js",
              "_headers",
              "vinext-client-entry-manifest.json",
            ].includes(e.name),
        )
        .map((e) =>
          e.isDirectory()
            ? list(path.join(dir, e.name))
            : path.join(dir, e.name),
        ),
    )
  ).flat();
}
const files = await list(output);
const assets = files.map(
  (f) => "/" + path.relative(output, f).replaceAll("\\", "/"),
);
const hash = createHash("sha256");
for (const file of files) hash.update(await fs.readFile(file));
const cache = "folio-" + hash.digest("hex").slice(0, 12);
const manifest = JSON.parse(
  await fs.readFile(path.join(output, ".vite/manifest.json"), "utf8"),
);
const core = coreAssets(manifest);
const sw = serviceWorkerSource(cache, assets, core);
await fs.writeFile(path.join(output, "sw.js"), sw);
console.log(
  `Offline app shell: ${core.length} sequential core files; optional resources cached on use, ${cache}`,
);
