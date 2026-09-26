import test from "node:test";
import assert from "node:assert/strict";
import {
  comparisonExample,
  cellStatus,
  comparisonProgress,
  comparisonBrief,
  validComparison,
} from "../lib/folio/comparison.ts";
import { citations, plainText } from "../lib/folio/model.ts";
import { buildBackupBlob } from "../lib/folio/backup.ts";
import { restoreBackup, markdown, referenceLines } from "../lib/folio/files.ts";

test("sample exposes revised evidence and unknowns without claiming automatic review", () => {
  const p = comparisonExample("en");
  assert.ok(validComparison(p.comparison));
  assert.deepEqual(comparisonProgress(p), {
    total: 9,
    reviewed: 0,
    changed: 3,
    unreviewed: 5,
    missing: 1,
  });
  const c = p.comparison.cells[0];
  c.reviewedAt = p.createdAt;
  assert.equal(cellStatus(c, p), "changed");
  assert.equal(c.value.includes("USD 15"), true);
  assert.equal(p.sources[0].versions.at(-1).text.includes("USD 18"), true);
});
test("facts need exact page evidence; personal judgments remain explicitly typed", () => {
  const p = comparisonExample("en"),
    c = p.comparison.cells[3];
  c.reviewedAt = p.createdAt;
  assert.equal(cellStatus(c, p), "reviewed");
  c.evidence[0].page = 100;
  assert.equal(cellStatus(c, p), "changed");
  c.evidence = [];
  assert.equal(cellStatus(c, p), "missing");
  c.kind = "judgment";
  assert.equal(cellStatus(c, p), "reviewed");
  c.kind = "unknown";
  assert.equal(cellStatus(c, p), "missing");
});
test("brief preserves old citations, marks gaps, and does not mutate the draft or comparison", () => {
  const p = comparisonExample("zh");
  const before = structuredClone(p);
  const nodes = comparisonBrief(p, "zh");
  const doc = { type: "doc", content: nodes };
  assert.match(plainText(doc), /来源变化，请复核/);
  assert.match(plainText(doc), /待确认/);
  assert.match(plainText(doc), /USD 15/);
  assert.equal(citations(doc).length, 8);
  assert.deepEqual(p, before);
  p.content = doc;
  assert.equal(
    referenceLines(p).length,
    8,
    "all distinct quotes appear in the appendix",
  );
  assert.match(markdown(doc), /\| 比较维度 \| Harbor \| Relay \| Plainbox \|/);
});
test("comparison backup restores identifiers, exact evidence and review marks", async () => {
  const p = comparisonExample("en");
  p.comparison.cells[3].reviewedAt = p.createdAt;
  const blob = await buildBackupBlob(p);
  const restored = await restoreBackup(
    new File([blob], "comparison.folio.json"),
  );
  assert.notEqual(restored.id, p.id);
  assert.deepEqual(restored.comparison, p.comparison);
  assert.deepEqual(comparisonProgress(restored), comparisonProgress(p));
  const json = JSON.parse(await blob.text());
  json.project.comparison.cells.push(json.project.comparison.cells[0]);
  await assert.rejects(
    () => restoreBackup(new File([JSON.stringify(json)], "bad.json")),
    /Invalid comparison/,
  );
});
test("invalid structure, excessive dimensions and mismatched coordinates are rejected", () => {
  const p = comparisonExample("en");
  for (const edit of [
    (c) => c.cells.push(null),
    (c) => c.options.push(c.options[0]),
    (c) => (c.cells[0].optionId = "missing"),
    (c) => (c.criteria = []),
    (c) => (c.cells[0].reviewedAt = "yesterday"),
    (c) => (c.cells[0].evidence[0].quote = ""),
  ]) {
    const c = structuredClone(p.comparison);
    edit(c);
    assert.equal(validComparison(c), false);
  }
});
