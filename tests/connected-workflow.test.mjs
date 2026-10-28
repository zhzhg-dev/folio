import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import Dexie from "dexie";
import { notebookExample } from "../lib/folio/notebook.ts";
import {
  applyConclusionChanges,
  connectComparisonFindings,
  validConclusionLinks,
} from "../lib/folio/conclusions.ts";
import {
  insertLinkedFinding,
  insertLinkedComparison,
  linkedBriefItems,
  updateLinkedBrief,
} from "../lib/folio/linked-brief.ts";
import { projectReview } from "../lib/folio/review.ts";
import {
  archiveFinding,
  restoreNotebookItem,
} from "../lib/folio/notebook-actions.ts";
import { createDelivery, deliveryHtml } from "../lib/folio/delivery.ts";
import { createWorkspaceStore } from "../lib/folio/storage.ts";
import { buildBackupBlob } from "../lib/folio/backup.ts";
import { restoreBackup } from "../lib/folio/backup-restore.ts";

function fixture() {
  let project = connectComparisonFindings(notebookExample("en"));
  const findingId = project.comparison.cells[0].findingId;
  project.content = insertLinkedFinding(project, findingId, "en").content;
  project.content = insertLinkedComparison(project, "en").content;
  return { project, findingId };
}

test("one comparison edit updates its finding, opens brief review, and preserves a delivered edition", () => {
  let { project, findingId } = fixture();
  const delivered = createDelivery(project, "en", {
    title: "Before the change",
    summary: "",
    origin: "brief",
    findingIds: [],
    includeNotes: false,
  });
  const html = deliveryHtml(delivered);
  project.deliveries = [delivered];
  const originalWriting = structuredClone(project.content);
  const nextValue =
    "Updated conclusion: check the annual commitment before choosing.";
  project = applyConclusionChanges(project, {
    comparison: {
      ...project.comparison,
      cells: project.comparison.cells.map((cell) =>
        cell.findingId === findingId ? { ...cell, value: nextValue } : cell,
      ),
    },
  });
  assert.equal(
    project.notebook.findings.find((finding) => finding.id === findingId).value,
    nextValue,
  );
  assert.deepEqual(project.content, originalWriting);
  const review = projectReview(project);
  assert.equal(review.filter((item) => item.linkedBlockId).length, 2);
  assert.equal(review.filter((item) => item.scope === "comparison").length, 0);
  assert.equal(review.filter((item) => item.findingId === findingId).length, 1);
  const first = linkedBriefItems(project)[0];
  project = { ...project, content: updateLinkedBrief(project, first) };
  // Recompute after accepting an update; earlier document selections are stale.
  const pending = linkedBriefItems(project).find(
    (item) => item.status === "updated",
  );
  project = { ...project, content: updateLinkedBrief(project, pending) };
  assert.ok(
    linkedBriefItems(project).every((item) => item.status === "current"),
  );
  assert.equal(deliveryHtml(project.deliveries[0]), html);
  assert.equal(JSON.stringify(project.deliveries).includes(nextValue), false);
});

test("connected work survives local persistence, archive, backup restore and explicit unarchive", async (t) => {
  let { project, findingId } = fixture();
  project = applyConclusionChanges(project, {
    notebook: archiveFinding(project.notebook, findingId),
  });
  const name = `folio-connected-${crypto.randomUUID()}`;
  const store = createWorkspaceStore(name);
  t.after(async () => {
    store.db.close();
    await Dexie.delete(name);
  });
  await store.load();
  await store.save({
    schemaVersion: 1,
    language: "en",
    languagePreferenceVersion: 1,
    activeId: project.id,
    projects: [project],
  });
  const loaded = (await store.load()).projects[0];
  assert.ok(validConclusionLinks(loaded));
  assert.equal(linkedBriefItems(loaded)[0].status, "archived");
  const restored = await restoreBackup(
    new File([await buildBackupBlob(loaded)], "connected.folio.json"),
  );
  assert.ok(validConclusionLinks(restored));
  assert.equal(restored.comparison.cells[0].findingId, findingId);
  assert.equal(linkedBriefItems(restored)[0].status, "archived");
  const resumed = applyConclusionChanges(restored, {
    notebook: restoreNotebookItem(
      restored.notebook,
      restored.notebook.archived[0].id,
    ),
  });
  assert.ok(validConclusionLinks(resumed));
  assert.equal(
    resumed.notebook.findings.find((finding) => finding.id === findingId)
      .reviewedAt,
    undefined,
  );
  assert.equal(resumed.comparison.cells[0].findingId, findingId);
});

test("restoration rejects dangling or divergent canonical links and preserves the valid input", async () => {
  const { project } = fixture();
  const payload = JSON.parse(await (await buildBackupBlob(project)).text());
  for (const change of [
    (p) => {
      p.comparison.cells[0].findingId = "missing-finding";
    },
    (p) => {
      p.comparison.cells[0].value = "A conflicting copy";
    },
    (p) => {
      delete p.comparison.cells[0].findingId;
    },
  ]) {
    const malformed = structuredClone(payload);
    change(malformed.project);
    await assert.rejects(
      () =>
        restoreBackup(
          new File([JSON.stringify(malformed)], "invalid.folio.json"),
        ),
      /conclusion links/,
    );
  }
  const valid = await restoreBackup(
    new File([JSON.stringify(payload)], "valid.folio.json"),
  );
  assert.deepEqual(valid.notebook, payload.project.notebook);
  assert.deepEqual(valid.content, payload.project.content);
});
