import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs/promises";
import ts from "typescript";
import { startupSession, STARTUP_KEY } from "../lib/folio/startup.ts";
import { pdfContainerWidth, pdfRenderSize } from "../lib/folio/pdf-layout.ts";
import { matchingPdfItems } from "../lib/folio/pdf-text.ts";
import { coreAssets, serviceWorkerSource } from "../scripts/offline-shell.mjs";

function memory() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}
test("safe startup does not import the workspace until explicitly opened", async () => {
  const source = await fs.readFile(
    new URL("../main.ts", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  let click;
  let imports = 0;
  let renders = 0;
  const events = {};
  const root = {
    innerHTML: "",
    querySelector() {
      return {
        addEventListener(type, fn) {
          if (type === "click") click = fn;
        },
      };
    },
  };
  const document = {
    getElementById() {
      return root;
    },
    documentElement: { dataset: {} },
  };
  vm.runInNewContext(code, {
    exports: {},
    require(name) {
      if (name === "./lib/folio/startup") return { startupSession };
      if (name === "./app/startup.css") return {};
      if (name === "./render") {
        imports++;
        return {
          renderWorkspace() {
            renders++;
          },
        };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
    document,
    window: {
      addEventListener(name, fn) {
        events[name] = fn;
      },
    },
    localStorage: memory(),
    location: { search: "?safe=1" },
    URLSearchParams,
    crypto: { randomUUID: () => "test-session" },
  });
  await Promise.resolve();
  assert.equal(imports, 0);
  assert.match(root.innerHTML, /Open workspace safely/);
  assert.equal(typeof click, "function");
  click();
  click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(imports, 1);
  assert.equal(renders, 1);
  assert.equal(document.documentElement.dataset.folioSafe, "true");
  assert.equal(typeof events.pagehide, "function");
});
test("an interrupted workspace requires confirmation; a cleanly closed one does not", () => {
  const store = memory();
  const first = startupSession(store, "first");
  assert.equal(first.needsRecovery, true);
  assert.equal(store.getItem(STARTUP_KEY), null);
  first.start();
  assert.equal(startupSession(store, "after-crash").needsRecovery, true);
  first.finish();
  assert.equal(startupSession(store, "after-close").needsRecovery, false);
  assert.equal(startupSession(store, "safe-link", true).needsRecovery, true);
});
test("closing one tab cannot clear another tab's recovery marker", () => {
  const store = memory();
  const one = startupSession(store, "one");
  const two = startupSession(store, "two");
  one.start();
  two.start();
  one.finish();
  assert.equal(store.getItem(STARTUP_KEY), "two");
  two.finish();
  assert.equal(store.getItem(STARTUP_KEY), null);
});
test("unavailable browser storage leaves startup behind the confirmation screen", () => {
  const blocked = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  const session = startupSession(blocked, "blocked");
  assert.equal(session.needsRecovery, true);
  assert.doesNotThrow(() => {
    session.start();
    session.finish();
  });
});
test("PDF fitting is stable across scrollbar appearance and fractional size noise", () => {
  const reports = [
    { border: 600.1, content: 598 },
    { border: 600.7, content: 581 },
    { border: 600.2, content: 598 },
  ];
  assert.deepEqual(
    reports.map((r) => pdfContainerWidth(r.border)),
    [578, 578, 578],
  );
});
test("PDF canvas allocation is bounded for large and extreme pages", () => {
  for (const [w, h] of [
    [612, 792],
    [100_000, 100_000],
    [1, 100_000],
    [100_000, 1],
  ]) {
    const r = pdfRenderSize(pdfContainerWidth(20_000), w, h, 2, 4);
    assert.ok(r.pixelWidth <= 4096 && r.pixelHeight <= 4096);
    assert.ok(r.pixelWidth * r.pixelHeight <= 4_000_000);
    assert.ok(r.pixelWidth > 0 && r.pixelHeight > 0);
  }
  assert.throws(() => pdfRenderSize(600, 0, 792, 1, 2));
});
test("PDF highlighting handles long text, emoji offsets, and an empty quote", () => {
  const items = [
    { str: "🗂️ " + "background ".repeat(30_000) },
    { str: "The annual budget is 4800 dollars." },
  ];
  assert.deepEqual(
    [...matchingPdfItems(items, "The annual budget is 4800 dollars.")],
    [1],
  );
  assert.equal(matchingPdfItems(items, "").size, 0);
});
test("offline install downloads only core files, sequentially", async () => {
  const manifest = {
    "index.html": {
      isEntry: true,
      file: "boot.js",
      css: ["boot.css"],
      dynamicImports: ["render.tsx"],
    },
    "render.tsx": {
      src: "render.tsx",
      file: "render.js",
      css: ["app.css"],
      imports: ["react"],
      dynamicImports: ["ai"],
    },
    react: { file: "react.js" },
    ai: { file: "ai.js", assets: ["model.bin"] },
    pdf: { file: "pdf.js" },
    font: { file: "chinese-font.woff2" },
  };
  const core = coreAssets(manifest);
  assert.ok(core.includes("/render.js") && core.includes("/react.js"));
  assert.ok(
    !core.includes("/ai.js") &&
      !core.includes("/pdf.js") &&
      !core.includes("/chinese-font.woff2"),
  );
  const handlers = {};
  const fetched = [];
  let active = 0;
  let peak = 0;
  vm.runInNewContext(
    serviceWorkerSource("folio-test", ["/ai.js", ...core], core),
    {
      self: {
        addEventListener: (type, fn) => (handlers[type] = fn),
        skipWaiting() {},
        location: { origin: "https://folio.test" },
      },
      caches: {
        async open() {
          return {
            async add(asset) {
              peak = Math.max(peak, ++active);
              await Promise.resolve();
              fetched.push(asset);
              active--;
            },
          };
        },
      },
    },
  );
  let pending;
  handlers.install({ waitUntil: (p) => (pending = p) });
  await pending;
  assert.equal(peak, 1);
  assert.deepEqual(fetched, core);
});
