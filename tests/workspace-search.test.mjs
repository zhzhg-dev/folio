import test from "node:test";
import assert from "node:assert/strict";
import { notebookExample } from "../lib/folio/notebook.ts";
import { archiveFinding } from "../lib/folio/notebook-actions.ts";
import {
  workspaceSearchInput,
  searchWorkspace,
  searchTargetExists,
  searchLimits,
} from "../lib/folio/workspace-search.ts";

test("global search covers findings, notes and bilingual text while excluding inactive work", () => {
  const p = notebookExample("en"),
    second = structuredClone(p);
  second.id = "second";
  second.name = "Another project";
  p.notebook.findings[0].note = "预算待确认 独特备注";
  const docs = workspaceSearchInput([
    p,
    second,
    { ...p, id: "archived", archivedAt: p.createdAt },
    { ...p, id: "trash", deletedAt: p.createdAt },
  ]);
  assert.equal(searchWorkspace(docs, "独特备注", "finding").total, 1);
  assert.equal(searchWorkspace(docs, "HARBOR", "finding").total > 0, true);
  assert.equal(searchWorkspace(docs, "").hits.length, 2);
  assert.deepEqual(
    new Set(
      workspaceSearchInput([p, second], second.id).map((d) => d.projectId),
    ),
    new Set([second.id]),
  );
  p.notebook = archiveFinding(p.notebook, p.notebook.findings[0].id);
  assert.equal(searchWorkspace(workspaceSearchInput([p]), "独特备注").total, 0);
});
test("source hits carry exact current revision, page and original quote; same IDs in other projects cannot hijack navigation", () => {
  const p = notebookExample("en");
  const v = p.sources[0].versions[0];
  p.sources[0].versions.push({
    ...v,
    id: "latest",
    pages: [
      { page: 1, text: "Opening page." },
      { page: 2, text: "证据所在页。 Annual export includes the metadata." },
    ],
    original: new Blob(["private original"]),
  });
  const docs = workspaceSearchInput([p]);
  const hit = searchWorkspace(docs, "metadata", "source").hits[0];
  assert.equal(hit.page, 2);
  assert.equal(hit.versionId, "latest");
  assert.ok(p.sources[0].versions.at(-1).pages[1].text.includes(hit.quote));
  assert.ok(searchTargetExists(p, hit));
  assert.equal(searchTargetExists({ ...p, id: "other" }, hit), false);
  assert.equal(searchTargetExists({ ...p, sources: [] }, hit), false);
  assert.equal(JSON.stringify(docs).includes("private original"), false);
  assert.ok(
    docs
      .filter((d) => d.kind === "source" && d.sourceId === p.sources[0].id)
      .every((d) => d.versionId === "latest"),
  );
});
test("search refuses oversized input and caps results; stale moved findings are rejected", () => {
  const p = notebookExample("en");
  const doc = workspaceSearchInput([p])[0];
  const result = searchWorkspace(
    Array.from({ length: 75 }, (_, i) => ({ ...doc, id: `p${i}` })),
    "",
  );
  assert.equal(result.total, 75);
  assert.equal(result.hits.length, searchLimits.results);
  const hit = searchWorkspace(workspaceSearchInput([p]), "Harbor", "finding")
    .hits[0];
  assert.ok(searchTargetExists(p, hit));
  p.notebook.findings.find((f) => f.id === hit.id).questionId = "changed";
  assert.equal(searchTargetExists(p, hit), false);
  p.sources[0].versions.at(-1).pages[0].text = "x".repeat(
    searchLimits.characters + 1,
  );
  assert.throws(() => workspaceSearchInput([p]), /Too much content/);
});
