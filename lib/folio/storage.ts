import Dexie, { type EntityTable } from "dexie";
import { type WorkspaceData, seedWorkspace } from "./model";
import { upgradePreferences } from "./preferences";
const db = new Dexie("folio-workspace") as Dexie & {
  workspaces: EntityTable<
    { id: string; data: WorkspaceData; revision?: number },
    "id"
  >;
};
db.version(1).stores({ workspaces: "id" });
let expectedRevision = 0;
export async function loadWorkspace() {
  const row = await db.workspaces.get("main");
  expectedRevision = row?.revision || 0;
  return row?.data ? upgradePreferences(row.data) : seedWorkspace();
}
export async function saveWorkspace(data: WorkspaceData) {
  await db.transaction("rw", db.workspaces, async () => {
    const row = await db.workspaces.get("main");
    if ((row?.revision || 0) !== expectedRevision)
      throw new Error(
        "另一个窗口已更新数据。请先备份当前修改，再刷新。 / Another window updated the data. Back up your edits before reloading.",
      );
    const nextRevision = expectedRevision + 1;
    await db.workspaces.put({ id: "main", data, revision: nextRevision });
    expectedRevision = nextRevision;
  });
}
