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
