import assert from "node:assert/strict";
import test from "node:test";
import { comparisonExample } from "../lib/folio/comparison.ts";
import { importProjectSources } from "../lib/folio/import-sources.ts";

test("an option import links the existing current source and deduplicates repeated files", () => {
  const p = comparisonExample("en");
  const option = p.comparison.options[1];
  const source = {
    ...p.sources[0],
    id: "incoming",
    versions: [p.sources[0].versions.at(-1)],
  };
  const incoming = {
    ...source,
    id: "unique",
    versions: [{ ...source.versions[0], hash: "new-file" }],
  };
  const { changes, added } = importProjectSources(
    p,
    [source, incoming, incoming],
    option.id,
  );
  assert.equal(added, 1);
  assert.deepEqual(changes.comparison.options[1].sourceIds, [
    p.sources[1].id,
    p.sources[0].id,
    "unique",
  ]);
  assert.equal(changes.sources.length, p.sources.length + 1);
  assert.equal(changes.comparison.options[0], p.comparison.options[0]);
  assert.deepEqual(option.sourceIds, [p.sources[1].id]);
});
test("assigning a historical or ambiguous duplicate requires choosing the current source explicitly", () => {
  const p = comparisonExample("en");
  const option = p.comparison.options[0];
  const old = { ...p.sources[0], versions: [p.sources[0].versions[0]] };
  assert.throws(
    () => importProjectSources(p, [old], option.id),
    /earlier revision/,
  );
  assert.equal(importProjectSources(p, [old]).added, 0);
  p.sources.push({ ...p.sources[1], id: "another" });
  assert.throws(
    () => importProjectSources(p, [p.sources[1]], option.id),
    /Multiple sources/,
  );
  assert.throws(
    () => importProjectSources(p, [old], "removed"),
    /no longer exists/,
  );
});
test("project limits count distinct accepted sources and reject an over-limit batch atomically", () => {
  const p = comparisonExample("en");
  const basis = p.sources[1];
  p.sources = Array.from({ length: 20 }, (_, i) => ({
    ...basis,
    id: String(i),
    versions: [{ ...basis.versions[0], hash: String(i) }],
  }));
  const option = p.comparison.options[0];
  const originalIds = [...option.sourceIds];
  assert.equal(importProjectSources(p, [p.sources[5]], option.id).added, 0);
  assert.throws(
    () => importProjectSources(p, [basis], option.id),
    /20 sources/,
  );
  p.sources.length = 3;
  const large = {
    ...basis,
    versions: [{ ...basis.versions[0], size: 80 * 1024 * 1024 }],
  };
  assert.throws(() => importProjectSources(p, [large]), /80 MB/);
  assert.equal(p.sources.length, 3);
  assert.deepEqual(option.sourceIds, originalIds);
});
