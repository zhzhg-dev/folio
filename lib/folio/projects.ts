import { makeProject, type Project, type WorkspaceData } from "./model.ts";
export const isActiveProject = (p: Project) => !p.deletedAt && !p.archivedAt;
export function ensureActiveProject(data: WorkspaceData): WorkspaceData {
  if (data.projects.some((p) => p.id === data.activeId && isActiveProject(p)))
    return data;
  const available = data.projects.find(isActiveProject);
  if (available) return { ...data, activeId: available.id };
  const empty = makeProject(
    data.language === "zh" ? "未命名研究" : "Untitled research",
    data.language,
  );
  empty.lastView = "findings";
  return { ...data, projects: [...data.projects, empty], activeId: empty.id };
}
export type ProjectAction =
  "archive" | "trash" | "restore" | "favorite" | "rename";
export function changeProject(
  data: WorkspaceData,
  id: string,
  action: ProjectAction,
  name?: string,
): WorkspaceData {
  const now = new Date().toISOString();
  const next = {
    ...data,
    projects: data.projects.map((p) => {
      if (p.id !== id) return p;
      if (action === "archive") return { ...p, archivedAt: now };
      if (action === "trash") return { ...p, deletedAt: now };
      if (action === "restore")
        return { ...p, deletedAt: undefined, archivedAt: undefined };
      if (action === "favorite") return { ...p, favorite: !p.favorite };
      if (action === "rename" && name?.trim())
        return { ...p, name: name.trim().slice(0, 160) };
      return p;
    }),
  };
  return ensureActiveProject(next);
}
export function openProject(data: WorkspaceData, id: string): WorkspaceData {
  if (!data.projects.some((p) => p.id === id && isActiveProject(p)))
    return data;
  return {
    ...data,
    activeId: id,
    projects: data.projects.map((p) =>
      p.id === id ? { ...p, lastOpenedAt: new Date().toISOString() } : p,
    ),
  };
}
