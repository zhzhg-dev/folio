import type { Project, Source, WorkspaceData } from "./model.ts";
export type WorkspaceManifest = Omit<WorkspaceData, "projects"> & {
  projectIds: string[];
};
export type StoredProject = Omit<Project, "sources"> & { sourceIds: string[] };
export type StoredSource = { projectId: string; id: string; data: Source };
export type WorkspaceRow = {
  id: string;
  revision?: number;
  data?: WorkspaceData;
  manifest?: WorkspaceManifest;
};
export function manifestFor(data: WorkspaceData): WorkspaceManifest {
  const { projects, ...preferences } = data;
  return { ...preferences, projectIds: projects.map((p) => p.id) };
}
export function projectRecord(project: Project): StoredProject {
  const { sources, ...record } = project;
  return { ...record, sourceIds: sources.map((s) => s.id) };
}
// Missing records must fail visibly instead of silently becoming empty data.
export function assembleWorkspace(
  manifest: WorkspaceManifest,
  projects: StoredProject[],
  sources: StoredSource[],
): WorkspaceData {
  if (
    !Array.isArray(manifest.projectIds) ||
    new Set(manifest.projectIds).size !== manifest.projectIds.length
  )
    throw new Error("Saved project index could not be read");
  const records = new Map(projects.map((p) => [p.id, p]));
  const sourceMap = new Map(
    sources.map((s) => [JSON.stringify([s.projectId, s.id]), s.data]),
  );
  const { projectIds, ...preferences } = manifest;
  return {
    ...preferences,
    projects: projectIds.map((id) => {
      const record = records.get(id);
      if (!record || !Array.isArray(record.sourceIds))
        throw new Error("Saved project is incomplete");
      const { sourceIds, ...project } = record;
      return {
        ...project,
        sources: sourceIds.map((sourceId) => {
          const source = sourceMap.get(JSON.stringify([id, sourceId]));
          if (!source) throw new Error("Saved source is incomplete");
          return source;
        }),
      };
    }),
  };
}
