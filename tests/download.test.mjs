import test from "node:test";
import assert from "node:assert/strict";
import { saveDownload } from "../lib/folio/backup-export.ts";

test("prepared downloads offer a real user-activated link and release the previous blob", (t) => {
  const oldDocument = globalThis.document,
    oldWindow = globalThis.window;
  const oldCreate = URL.createObjectURL,
    oldRevoke = URL.revokeObjectURL;
  const nodes = [],
    revoked = [],
    events = new Map();
  let id = 0;
  globalThis.document = {
    documentElement: { lang: "en" },
    body: { append: (node) => nodes.push(node) },
    querySelector: () => null,
    createElement: (tag) => ({
      tag,
      children: [],
      handlers: {},
      append(...children) {
        this.children = children;
      },
      setAttribute() {},
      remove() {
        this.removed = true;
      },
      addEventListener(event, handler) {
        this.handlers[event] = handler;
      },
    }),
  };
  globalThis.window = {
    addEventListener: (name, handler) => events.set(name, handler),
    removeEventListener: (name) => events.delete(name),
  };
  URL.createObjectURL = () => `blob:test-${++id}`;
  URL.revokeObjectURL = (url) => revoked.push(url);
  t.after(() => {
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
  });
  saveDownload(new Blob(["one"]), "<unsafe>.folio.json");
  const link = nodes[0].children.find((n) => n.tag === "a");
  assert.equal(link.textContent, "Save file");
  assert.equal(link.download, "-unsafe-.folio.json");
  assert.equal(link.href, "blob:test-1");
  assert.deepEqual(revoked, []);
  saveDownload(new Blob(["two"]), "second.json");
  assert.ok(nodes[0].removed);
  assert.deepEqual(revoked, ["blob:test-1"]);
  nodes[1].children.find((n) => n.tag === "button").handlers.click();
  assert.deepEqual(revoked, ["blob:test-1", "blob:test-2"]);
  assert.equal(events.size, 0);
  saveDownload(new Blob(["three"]), "third.json");
  events.get("pagehide")();
  assert.ok(nodes[2].removed);
  assert.deepEqual(revoked, ["blob:test-1", "blob:test-2", "blob:test-3"]);
});

test("direct save reports success only after closing the file and retains fallback on errors", async (t) => {
  const originals = {
    document: globalThis.document,
    window: globalThis.window,
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
  };
  let notice,
    finish,
    written,
    fail = false;
  const calls = [];
  globalThis.document = {
    documentElement: { lang: "en" },
    querySelector: () => null,
    body: { append: (node) => (notice = node) },
    createElement: (tag) => ({
      tag,
      children: [],
      handlers: {},
      append(...children) {
        this.children.push(...children);
      },
      setAttribute() {},
      remove() {},
      addEventListener(name, fn) {
        this.handlers[name] = fn;
      },
    }),
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    async showSaveFilePicker() {
      if (fail) throw new Error("unavailable");
      return {
        async createWritable() {
          return {
            async write(blob) {
              written = await blob.text();
            },
            close() {
              calls.push("close");
              return new Promise((resolve) => (finish = resolve));
            },
            async abort() {
              calls.push("abort");
            },
          };
        },
      };
    },
  };
  URL.createObjectURL = () => "blob:direct-save";
  URL.revokeObjectURL = () => {};
  t.after(() => {
    globalThis.document = originals.document;
    globalThis.window = originals.window;
    URL.createObjectURL = originals.create;
    URL.revokeObjectURL = originals.revoke;
  });
  saveDownload(new Blob(["real bytes"]), "export.json");
  const save = notice.children.find((n) => n.textContent === "Save as…");
  const pending = save.handlers.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(written, "real bytes");
  assert.equal(notice.children[0].textContent, "Your file is ready");
  finish();
  await pending;
  assert.equal(notice.children[0].textContent, "File saved");
  fail = true;
  await save.handlers.click();
  assert.match(notice.children[0].textContent, /did not finish/);
  assert.ok(
    notice.children.some((n) => n.tag === "a" && n.href === "blob:direct-save"),
  );
  notice.children.find((n) => n.textContent === "Dismiss").handlers.click();
});
