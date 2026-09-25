import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
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
const sw = `const CACHE=${JSON.stringify(cache)};const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('folio-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(c=>c.match('/index.html'))));return;}
if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async c=>(await c.match(event.request))||fetch(event.request)));});`;
await fs.writeFile(path.join(output, "sw.js"), sw);
console.log(`Offline app shell: ${assets.length} files, ${cache}`);
