import test from "node:test";
import assert from "node:assert/strict";
import {
  freshWorkspace,
  notebookExample,
  notebookFor,
  validNotebook,
  findingStatus,
  editFinding,
  findingNodes,
  findingsFromDraft,
} from "../lib/folio/notebook.ts";
import { comparisonExample } from "../lib/folio/comparison.ts";
import { citations, plainText } from "../lib/folio/model.ts";
import { buildBackupBlob } from "../lib/folio/backup.ts";
import { restoreBackup } from "../lib/folio/backup-restore.ts";
import { evidenceExists } from "../lib/folio/research.ts";

test("new users start with their own objective, without fictional conclusions", () => {
  const data = freshWorkspace();
  assert.equal(data.language, "en");
  const p = data.projects[0];
  assert.equal(p.lastView, "findings");
  assert.equal(p.example, undefined);
  assert.equal(p.sources.length, 0);
  assert.equal(p.notebook.findings.length, 0);
  assert.ok(validNotebook(p.notebook));
});
test("both bilingual samples have valid, traceable findings and explicit gaps", () => {
  for (const language of ["en", "zh"]) {
    const p = notebookExample(language);
    assert.ok(p.example);
    assert.ok(validNotebook(p.notebook));
    assert.equal(
      p.notebook.findings.filter((f) => findingStatus(f, p) === "missing")
        .length,
      1,
    );
    assert.ok(
      p.notebook.findings
        .flatMap((f) => f.evidence)
        .every((e) => evidenceExists(e, p)),
    );
    assert.ok(p.notebook.findings.every((f) => !f.reviewedAt));
  }
});
test("existing comparisons are readable as a notebook without mutating saved work", () => {
  const p = comparisonExample("en");
  const before = structuredClone(p);
  const n = notebookFor(p);
  assert.ok(validNotebook(n));
  assert.equal(n.findings.length, 8);
  assert.deepEqual(p, before);
  n.findings[0] = editFinding(n.findings[0], {
    value: "My own interpretation",
  });
  assert.deepEqual(p, before);
});
test("note and claim edits reset human review; a new source version makes review stale", () => {
  const p = notebookExample("en");
  const f = { ...p.notebook.findings[0], reviewedAt: p.createdAt };
  assert.equal(findingStatus(f, p), "reviewed");
  assert.equal(
    editFinding(f, { note: "Check conditions" }).reviewedAt,
    undefined,
  );
  assert.equal(
    editFinding(f, { value: "Different finding" }).reviewedAt,
    undefined,
  );
  const source = p.sources.find((s) => s.id === f.evidence[0].sourceId);
  source.versions.push({ ...source.versions.at(-1), id: "newer-revision" });
  assert.equal(findingStatus(f, p), "changed");
  assert.equal(
    findingStatus({ ...f, evidence: [], kind: "fact" }, p),
    "missing",
  );
});
test("brief snapshots preserve note, review status, exact page and revision; unsupported citations are blocked", () => {
  const p = notebookExample("en");
  const f = p.notebook.findings[0];
  const before = structuredClone(p);
  const doc = { type: "doc", content: findingNodes(f, p, "en") };
  assert.match(plainText(doc), /Not reviewed/);
  assert.match(plainText(doc), /Your note:/);
  assert.match(plainText(doc), /1,080/);
  const citation = citations(doc)[0];
  assert.equal(citation.attrs.versionId, f.evidence[0].versionId);
  assert.equal(citation.attrs.page, f.evidence[0].page);
  assert.equal(citation.attrs.quote, f.evidence[0].quote);
  assert.deepEqual(p, before);
  assert.match(
    plainText({
      type: "doc",
      content: findingNodes(p.notebook.findings[2], p, "en"),
    }),
    /Needs evidence/,
  );
  assert.throws(() =>
    findingNodes(
      { ...f, evidence: [{ ...f.evidence[0], page: 999 }] },
      p,
      "en",
    ),
  );
});
test("selected passages become separate unreviewed findings attached to their exact question", () => {
  const p = notebookExample("en");
  const f = p.notebook.findings[0];
  const result = findingsFromDraft(
    {
      paragraphs: [{ text: "My claim", evidenceIds: [f.evidence[0].id] }],
      evidence: [...f.evidence, ...p.notebook.findings[1].evidence],
    },
    f.questionId,
  );
  assert.equal(result[0].questionId, f.questionId);
  assert.equal(result[0].evidence.length, 1);
  assert.equal(result[0].reviewedAt, undefined);
});
test("backup roundtrip preserves questions, own notes, evidence and review; malformed notebooks are rejected", async () => {
  const p = notebookExample("zh");
  p.notebook.findings[0].reviewedAt = p.createdAt;
  const blob = await buildBackupBlob(p);
  const restored = await restoreBackup(new File([blob], "notebook.json"));
  assert.deepEqual(restored.notebook, p.notebook);
  const payload = JSON.parse(await blob.text());
  payload.project.notebook.findings[0].questionId = "does-not-exist";
  await assert.rejects(
    () => restoreBackup(new File([JSON.stringify(payload)], "bad.json")),
    /notebook/,
  );
  for (const mutate of [
    (n) => n.questions.push(n.questions[0]),
    (n) => n.findings.push(n.findings[0]),
    (n) => (n.findings[0].note = null),
    (n) => (n.findings[0].evidence[0].quote = null),
  ]) {
    const n = structuredClone(p.notebook);
    mutate(n);
    assert.equal(validNotebook(n), false);
  }
});
