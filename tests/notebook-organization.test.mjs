import test from "node:test";
import assert from "node:assert/strict";
import {
  notebookExample,
  notebookFor,
  validNotebook,
} from "../lib/folio/notebook.ts";
import { comparisonExample } from "../lib/folio/comparison.ts";
import {
  archiveFinding,
  archiveQuestion,
  restoreNotebookItem,
  moveFinding,
  reorderFinding,
  reorderQuestion,
  captureFinding,
} from "../lib/folio/notebook-actions.ts";
import { buildBackupBlob } from "../lib/folio/backup.ts";
import { restoreBackup } from "../lib/folio/backup-restore.ts";
import { researchInput } from "../lib/folio/research-task.ts";

test("capture keeps the exact historical page, note and selected question without mutating the project", () => {
  const p = notebookExample("en"),
    before = structuredClone(p),
    e = p.notebook.findings[0].evidence[0];
  const source = p.sources.find((s) => s.id === e.sourceId);
  source.versions.push({ ...source.versions[0], id: "latest" });
  const input = {
    evidence: e,
    questionId: p.notebook.questions[1].id,
    value: "A captured finding",
    note: "Check this later",
    kind: "judgment",
  };
  const { notebook, finding } = captureFinding(p, input);
  assert.ok(validNotebook(notebook));
  assert.equal(finding.reviewedAt, undefined);
  assert.equal(finding.evidence[0].versionId, e.versionId);
  assert.equal(finding.note, input.note);
  assert.deepEqual(p.notebook, before.notebook);
  assert.deepEqual(p.content, before.content);
  assert.throws(
    () => captureFinding({ ...p, notebook }, input),
    /already saved/,
  );
  assert.throws(
    () =>
      captureFinding(p, {
        ...input,
        evidence: { ...e, quote: "Not an original passage" },
      }),
    /exact continuous/,
  );
  assert.throws(
    () =>
      captureFinding(p, {
        ...input,
        evidence: { ...e, name: "x".repeat(1001) },
      }),
    /invalid/,
  );
  assert.throws(
    () =>
      captureFinding(p, {
        ...input,
        evidence: { ...e, quote: "x".repeat(10001) },
      }),
    /10,000/,
  );
});
test("moving resets review and preserves evidence; reordering preserves review and sibling grouping", () => {
  const p = notebookExample("en"),
    n = p.notebook;
  n.findings[0].reviewedAt = p.createdAt;
  const f = n.findings[0],
    before = structuredClone(n);
  const reordered = reorderFinding(n, f.id, 1);
  assert.equal(reordered.findings[1].id, f.id);
  assert.equal(reordered.findings[1].reviewedAt, p.createdAt);
  assert.equal(
    reorderQuestion(n, n.questions[0].id, 1).questions[1].id,
    n.questions[0].id,
  );
  const moved = moveFinding(n, f.id, n.questions[1].id).findings.at(-1);
  assert.equal(moved.reviewedAt, undefined);
  assert.deepEqual(moved.evidence, f.evidence);
  assert.deepEqual(n, before);
  assert.throws(() => moveFinding(n, f.id, "gone"));
});
test("archive and restore parent/child in either valid order without data loss", () => {
  const n = notebookExample("en").notebook,
    original = structuredClone(n);
  let next = archiveFinding(n, n.findings[0].id);
  const archivedFinding = next.archived[0].id;
  next = archiveQuestion(next, n.questions[0].id);
  const archivedQuestion = next.archived[0].id;
  const before = structuredClone(next);
  assert.ok(validNotebook(next));
  assert.throws(
    () => restoreNotebookItem(next, archivedFinding),
    /Restore the original/,
  );
  assert.deepEqual(next, before);
  next = restoreNotebookItem(next, archivedQuestion);
  next = restoreNotebookItem(next, archivedFinding);
  assert.ok(validNotebook(next));
  assert.equal(next.archived.length, 0);
  assert.deepEqual(
    new Set(next.findings.map((f) => f.id)),
    new Set(n.findings.map((f) => f.id)),
  );
  assert.deepEqual(
    next.findings.find((f) => f.id === n.findings[0].id),
    { ...n.findings[0], reviewedAt: undefined },
  );
  assert.deepEqual(n, original);
});
test("restore and archive capacity errors leave the original content intact", () => {
  let n = notebookExample("en").notebook;
  n = archiveQuestion(n, n.questions[0].id);
  n.questions = Array.from({ length: 30 }, (_, i) => ({
    id: `q${i}`,
    title: `Question ${i}`,
  }));
  const before = structuredClone(n);
  assert.throws(() => restoreNotebookItem(n, n.archived[0].id), /limit/);
  assert.deepEqual(n, before);
  n = notebookExample("en").notebook;
  const f = n.findings[0];
  n = archiveFinding(n, f.id);
  n.findings = Array.from({ length: 200 }, (_, i) => ({ ...f, id: `f${i}` }));
  const full = structuredClone(n);
  assert.throws(() => restoreNotebookItem(n, n.archived[0].id), /200/);
  assert.deepEqual(n, full);
  n.archived = Array.from({ length: 200 }, (_, i) => ({
    ...n.archived[0],
    id: `a${i}`,
    findings: [{ ...f, id: `archived${i}` }],
  }));
  const archiveFull = structuredClone(n);
  assert.throws(() => archiveFinding(n, n.findings[0].id), /Archive holds/);
  assert.deepEqual(n, archiveFull);
});
test("archive validation rejects malformed and duplicate IDs without throwing", () => {
  assert.equal(
    validNotebook({
      objective: "",
      questions: [],
      findings: [null],
      archived: [],
    }),
    false,
  );
  let n = notebookExample("en").notebook;
  assert.ok(validNotebook(n));
  n = archiveFinding(n, n.findings[0].id);
  for (const patch of [
    { archivedAt: "not-a-date" },
    { findings: [null] },
    { question: { id: "wrong", title: "Other" } },
  ])
    assert.equal(
      validNotebook({ ...n, archived: [{ ...n.archived[0], ...patch }] }),
      false,
    );
  assert.equal(
    validNotebook({
      ...n,
      findings: [...n.findings, n.archived[0].findings[0]],
    }),
    false,
  );
});
test("backups retain archives and exact original evidence; legacy comparison stays independent", async () => {
  const p = notebookExample("en");
  p.notebook = archiveQuestion(p.notebook, p.notebook.questions[0].id);
  const restored = await restoreBackup(
    new File([await buildBackupBlob(p)], "archive.folio.json"),
  );
  assert.deepEqual(restored.notebook, p.notebook);
  const legacy = comparisonExample("en"),
    before = structuredClone(legacy);
  const n = notebookFor(legacy);
  assert.ok(validNotebook(archiveQuestion(n, n.questions[0].id)));
  assert.deepEqual(legacy, before);
});
test("research workers receive only current selected source pages, never archives, deliveries or blobs", () => {
  const p = notebookExample("en");
  p.notebook = archiveFinding(p.notebook, p.notebook.findings[0].id);
  p.deliveries = [{ secret: "delivery" }];
  p.reviewHistory = [{ secret: "history" }];
  p.sources[0].versions[0].original = new Blob(["original"]);
  const input = researchInput(p, [p.sources[0].id]);
  for (const key of ["notebook", "deliveries", "reviewHistory", "reading"])
    assert.equal(input[key], undefined);
  assert.equal(input.sources[0].versions[0].original, undefined);
  assert.equal(input.sources[1].versions.length, 0);
  assert.deepEqual(
    input.sources.map((s) => s.id),
    p.sources.map((s) => s.id),
  );
});
