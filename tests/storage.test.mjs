import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import Dexie from "dexie";
import { createWorkspaceStore } from "../lib/folio/storage.ts";
import { freshWorkspace } from "../lib/folio/notebook.ts";
import { makeProject } from "../lib/folio/model.ts";
import { changeProject, openProject } from "../lib/folio/projects.ts";
import { sourceFromText } from "../lib/folio/files.ts";
import { readSavedProjects } from "../lib/folio/recovery-storage.ts";
import { buildBackupBlob } from "../lib/folio/backup.ts";
import { restoreBackup } from "../lib/folio/backup-restore.ts";

async function fixture(t, legacy = false) {
  const name = `folio-test-${crypto.randomUUID()}`;
  const data = freshWorkspace();
  data.projects[0].sources = [
    await sourceFromText("Evidence", "Exact bilingual evidence 原始资料."),
  ];
  data.projects.push({
    ...makeProject("Second", "en"),
    sources: data.projects[0].sources,
  });
  if (legacy) {
    const old = new Dexie(name);
    old.version(1).stores({ workspaces: "id" });
    await old.table("workspaces").put({ id: "main", data, revision: 7 });
    old.close();
  }
  const store = createWorkspaceStore(name);
  t.after(async () => {
    store.db.close();
    await Dexie.delete(name);
  });
  return { name, data, store };
}

test("v1 migration preserves project order, original bytes, revisions and isolated source IDs", async (t) => {
  const { store, data } = await fixture(t, true);
  const loaded = await store.load();
  assert.deepEqual(loaded, data);
  const row = await store.db.workspaces.get("main");
  assert.equal(row.revision, 7);
  assert.equal(row.data, undefined);
  assert.equal(await store.db.sources.count(), 2);
  const original = loaded.projects[0].sources[0].versions[0].original;
  assert.equal(await original.text(), "Exact bilingual evidence 原始资料.");
  assert.deepEqual((await store.db.projects.get(data.activeId)).sourceIds, [
    data.projects[0].sources[0].id,
  ]);
});

test("editing a note writes only its project, preserving other projects and unchanged source records", async (t) => {
  const { store, data } = await fixture(t);
  await store.load();
  await store.save(data);
  let projectWrites = 0,
    sourceWrites = 0;
  store.db.projects.hook("updating", () => {
    projectWrites++;
  });
  store.db.sources.hook("updating", () => {
    sourceWrites++;
  });
  const edited = {
    ...data,
    projects: data.projects.map((p, i) =>
      i ? p : { ...p, description: "Edited note" },
    ),
  };
  await store.save(edited);
  assert.equal(projectWrites, 1);
  assert.equal(sourceWrites, 0);
  assert.equal(store.getLastSave().sources, 0);
  assert.deepEqual(await store.load(), edited);
});

test("a failed transaction rolls back partial project edits and can retry the unchanged draft", async (t) => {
  const { store, data } = await fixture(t);
  await store.load();
  await store.save(data);
  const fail = () => {
    throw new Error("simulated quota failure");
  };
  store.db.workspaces.hook("updating", fail);
  const edited = {
    ...data,
    projects: data.projects.map((p) => ({
      ...p,
      description: "Must commit together",
    })),
  };
  await assert.rejects(store.save(edited), /simulated quota/);
  assert.equal(
    (await store.db.projects.get(data.activeId)).description,
    data.projects[0].description,
  );
  store.db.workspaces.hook("updating").unsubscribe(fail);
  await store.save(edited);
  assert.deepEqual(await store.load(), edited);
});

test("a stale window cannot overwrite a newer commit, including source bytes", async (t) => {
  const { store, data, name } = await fixture(t);
  await store.load();
  await store.save(data);
  const other = createWorkspaceStore(name);
  t.after(() => other.db.close());
  const stale = await other.load();
  const current = {
    ...data,
    projects: data.projects.map((p, i) =>
      i ? p : { ...p, description: "Newer work" },
    ),
  };
  await store.save(current);
  await assert.rejects(
    other.save({ ...stale, language: "zh" }),
    /Another window/,
  );
  assert.deepEqual(await store.load(), current);
});

test("a malformed legacy source index aborts migration without losing the old workspace", async (t) => {
  const name = `folio-bad-${crypto.randomUUID()}`;
  const data = freshWorkspace();
  data.projects.push({ ...makeProject("Malformed", "en"), sources: null });
  const old = new Dexie(name);
  old.version(1).stores({ workspaces: "id" });
  await old.table("workspaces").put({ id: "main", data, revision: 9 });
  old.close();
  const upgraded = createWorkspaceStore(name);
  await assert.rejects(upgraded.load(), /source index/);
  upgraded.db.close();
  const reader = new Dexie(name);
  reader.version(1).stores({ workspaces: "id" });
  assert.deepEqual((await reader.table("workspaces").get("main")).data, data);
  assert.equal(reader.verno, 1);
  reader.close();
  await Dexie.delete(name);
});

test("recovery reads the migrated schema and includes archived and trashed projects without writes", async (t) => {
  const { store, data, name } = await fixture(t);
  await store.load();
  const changed = changeProject(
    changeProject(data, data.projects[0].id, "trash"),
    data.projects[1].id,
    "archive",
  );
  await store.save(changed);
  const before = await store.db.workspaces.get("main");
  assert.deepEqual(await readSavedProjects(indexedDB, name), changed.projects);
  assert.deepEqual(await store.db.workspaces.get("main"), before);
});

test("archive, trash and restore keep sources and research, even for the last active project", async () => {
  const data = freshWorkspace();
  const p = data.projects[0];
  p.sources = [await sourceFromText("Original", "Keep all evidence")];
  p.notebook.objective = "Preserve my research";
  const trash = changeProject(data, p.id, "trash");
  assert.notEqual(trash.activeId, p.id);
  assert.equal(trash.projects[0].sources, p.sources);
  assert.equal(trash.projects[0].notebook, p.notebook);
  assert.equal(openProject(trash, p.id), trash);
  const restored = changeProject(trash, p.id, "restore");
  assert.equal(restored.projects[0].deletedAt, undefined);
  assert.equal(openProject(restored, p.id).activeId, p.id);
  assert.equal(data.projects.length, 1);
  assert.equal(p.deletedAt, undefined);
});

test("a backup from Trash restores as a separate active project with original bytes", async () => {
  const data = freshWorkspace();
  data.projects[0].sources = [
    await sourceFromText("Document", "Bilingual backup 恢复"),
  ];
  const trashed = changeProject(data, data.activeId, "trash").projects[0];
  const blob = await buildBackupBlob(trashed);
  const restored = await restoreBackup(new File([blob], "trash.folio.json"));
  assert.notEqual(restored.id, trashed.id);
  assert.equal(restored.deletedAt, undefined);
  assert.equal(restored.archivedAt, undefined);
  assert.equal(
    await restored.sources[0].versions[0].original.text(),
    "Bilingual backup 恢复",
  );
});

test("incomplete normalized records fail without replacing saved data", async (t) => {
  const { store, data } = await fixture(t);
  await store.load();
  await store.save(data);
  await store.db.sources.delete([
    data.activeId,
    data.projects[0].sources[0].id,
  ]);
  await assert.rejects(store.load(), /source is incomplete/);
  assert.equal(await store.db.projects.count(), 2);
});
