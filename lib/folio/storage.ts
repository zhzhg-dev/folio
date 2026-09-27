import Dexie, { type EntityTable, type Table } from "dexie";
import type { WorkspaceData } from "./model.ts";
import { upgradePreferences } from "./preferences.ts";
import { freshWorkspace } from "./notebook.ts";
import { ensureActiveProject } from "./projects.ts";
import {
  assembleWorkspace,
  manifestFor,
  projectRecord,
  type StoredProject,
  type StoredSource,
  type WorkspaceRow,
} from "./storage-shape.ts";

export function createWorkspaceStore(name = "folio-workspace") {
  const db = new Dexie(name) as Dexie & {
    workspaces: EntityTable<WorkspaceRow, "id">;
    projects: EntityTable<StoredProject, "id">;
    sources: Table<StoredSource, [string, string]>;
  };
  db.version(1).stores({ workspaces: "id" });
  db.version(2)
    .stores({
      workspaces: "id",
      projects: "id",
      sources: "[projectId+id], projectId",
    })
    .upgrade(async (tx) => {
      const row: WorkspaceRow | undefined = await tx
        .table("workspaces")
        .get("main");
      if (!row?.data) return;
      const data = row.data;
      if (
        !Array.isArray(data.projects) ||
        !data.projects.length ||
        new Set(data.projects.map((p) => p.id)).size !== data.projects.length
      )
        throw new Error("Saved project index could not be read");
      for (const project of data.projects) {
        if (
          !Array.isArray(project.sources) ||
          new Set(project.sources.map((s) => s.id)).size !==
            project.sources.length
        )
          throw new Error("Saved source index could not be read");
        await tx.table("projects").put(projectRecord(project));
        if (project.sources.length)
          await tx
            .table("sources")
            .bulkPut(
              project.sources.map((source) => ({
                projectId: project.id,
                id: source.id,
                data: source,
              })),
            );
      }
      // Atomic replacement: failure keeps the old schema and its complete data.
      await tx
        .table("workspaces")
        .put({
          id: "main",
          revision: row.revision || 0,
          manifest: manifestFor(data),
        });
    });
  let revision = 0;
  let baseline: WorkspaceData | undefined;
  let lastSave:
    | { milliseconds: number; projects: number; sources: number; at: string }
    | undefined;
  return {
    db,
    getLastSave: () => lastSave,
    async load(): Promise<WorkspaceData> {
      const result = await db.transaction(
        "r",
        db.workspaces,
        db.projects,
        db.sources,
        async () => {
          const row = await db.workspaces.get("main");
          if (!row) {
            if ((await db.projects.count()) || (await db.sources.count()))
              throw new Error("Saved workspace index is missing");
            return { data: undefined, revision: 0 };
          }
          if (!row.manifest)
            throw new Error("Saved workspace could not be read");
          return {
            data: assembleWorkspace(
              row.manifest,
              await db.projects.toArray(),
              await db.sources.toArray(),
            ),
            revision: row.revision || 0,
          };
        },
      );
      revision = result.revision;
      baseline = result.data;
      return ensureActiveProject(
        result.data ? upgradePreferences(result.data) : freshWorkspace(),
      );
    },
    async save(data: WorkspaceData): Promise<void> {
      const started = performance.now();
      const previous = new Map(baseline?.projects.map((p) => [p.id, p]) || []);
      const changed = data.projects.filter((p) => p !== previous.get(p.id));
      let sourceWrites = 0;
      const expectedRevision = revision;
      const nextRevision = expectedRevision + 1;
      await db.transaction(
        "rw",
        db.workspaces,
        db.projects,
        db.sources,
        async () => {
          const row = await db.workspaces.get("main");
          if ((row?.revision || 0) !== expectedRevision)
            throw new Error(
              "另一个窗口已更新数据。请先备份当前修改，再刷新。 / Another window updated the data. Back up your edits before reloading.",
            );
          for (const project of changed) {
            await db.projects.put(projectRecord(project));
            const before = new Map(
              previous.get(project.id)?.sources.map((s) => [s.id, s]) || [],
            );
            for (const source of project.sources) {
              if (source !== before.get(source.id)) {
                await db.sources.put({
                  projectId: project.id,
                  id: source.id,
                  data: source,
                });
                sourceWrites++;
              }
              before.delete(source.id);
            }
            for (const id of before.keys())
              await db.sources.delete([project.id, id]);
          }
          const currentIds = new Set(data.projects.map((p) => p.id));
          for (const id of previous.keys())
            if (!currentIds.has(id)) {
              await db.sources.where("projectId").equals(id).delete();
              await db.projects.delete(id);
            }
          await db.workspaces.put({
            id: "main",
            manifest: manifestFor(data),
            revision: nextRevision,
          });
        },
      );
      revision = nextRevision;
      baseline = data;
      lastSave = {
        milliseconds: Math.round(performance.now() - started),
        projects: changed.length,
        sources: sourceWrites,
        at: new Date().toISOString(),
      };
    },
  };
}
// Keep the revision baseline through development-only hot updates. Reload the
// page to exercise changes to the storage implementation itself.
const store: ReturnType<typeof createWorkspaceStore> = import.meta.hot?.data.folioStore || createWorkspaceStore();
import.meta.hot?.dispose(data => { data.folioStore = store; });
export const loadWorkspace = () => store.load();
export const saveWorkspace = (data: WorkspaceData) => store.save(data);
export const lastSaveDetails = () => store.getLastSave();
