export function coreAssets(manifest) {
  const assets = new Set([
    "/index.html",
    "/favicon.svg",
    "/manifest.webmanifest",
  ]);
  const visited = new Set();
  function add(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing build chunk: ${key}`);
    assets.add("/" + chunk.file);
    for (const css of chunk.css || []) assets.add("/" + css);
    for (const dependency of chunk.imports || []) add(dependency);
  }
  for (const [key, chunk] of Object.entries(manifest)) {
    if (chunk.isEntry || chunk.src === "render.tsx") add(key);
  }
  return [...assets];
}

export function serviceWorkerSource(cache, assets, core) {
  return `const CACHE=${JSON.stringify(cache)};const ASSETS=new Set(${JSON.stringify(assets)});const CORE=${JSON.stringify(core)};
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);for(const asset of CORE)await cache.add(asset);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('folio-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||['/signin-with-chatgpt','/signout-with-chatgpt','/callback'].includes(url.pathname))return;
if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(c=>c.match('/index.html'))));return;}
if(ASSETS.has(url.pathname))event.respondWith((async()=>{const cache=await caches.open(CACHE);const saved=await cache.match(url.pathname);if(saved)return saved;const response=await fetch(event.request);if(response.ok&&!response.redirected){event.waitUntil(cache.put(url.pathname,response.clone()).catch(()=>{}));}return response;})());});`;
}
