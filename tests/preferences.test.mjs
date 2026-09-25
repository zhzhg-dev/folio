import test from "node:test";
import assert from "node:assert/strict";
import {
  seedWorkspace,
  legacySeedWorkspace,
  citations,
} from "../lib/folio/model.ts";
import { upgradePreferences } from "../lib/folio/preferences.ts";
import { citationStatus } from "../lib/folio/integrity.ts";

test("new workspaces start in English with valid sample evidence", () => {
  const data = seedWorkspace();
  assert.equal(data.language, "en");
  assert.equal(data.projects[0].reportTitle, "A quieter way to work");
  for (const citation of citations(data.projects[0].content))
    assert.equal(citationStatus(citation.attrs, data.projects[0]), "current");
});
test("the untouched legacy sample upgrades without losing its original dates", () => {
  const data = legacySeedWorkspace();
  const upgraded = upgradePreferences(data);
  assert.equal(upgraded.language, "en");
  assert.equal(upgraded.projects[0].reportTitle, "A quieter way to work");
  assert.equal(upgraded.projects[0].createdAt, data.projects[0].createdAt);
  assert.equal(data.projects[0].reportTitle, "独立工作的新秩序");
});
test("edited documents, sources and snapshots survive the language migration", () => {
  for (const edit of [
    (p) => {
      p.content.content[0].content[0].text = "My own title";
    },
    (p) => {
      p.sources[0].versions[0].text += " My evidence.";
    },
    (p) => {
      p.snapshots.push({
        id: "my-snapshot",
        title: "Keep this",
        content: p.content,
        reportTitle: p.reportTitle,
        createdAt: p.createdAt,
      });
    },
    (p) => {
      p.reportTitle = "My private document";
    },
  ]) {
    const data = legacySeedWorkspace();
    edit(data.projects[0]);
    const before = structuredClone(data.projects);
    const upgraded = upgradePreferences(data);
    assert.deepEqual(upgraded.projects, before);
  }
});
test("an explicit Chinese preference persists across subsequent loads", () => {
  const data = { ...seedWorkspace(), language: "zh" };
  assert.equal(upgradePreferences(data), data);
  assert.equal(upgradePreferences(data).language, "zh");
});
