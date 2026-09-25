import {
  legacySeedWorkspace,
  seedWorkspace,
  type Project,
  type WorkspaceData,
} from "./model.ts";

function demoSignature(project: Project) {
  return JSON.stringify({
    name: project.name,
    title: project.reportTitle,
    description: project.description,
    content: project.content,
    sources: project.sources.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      versions: s.versions.map((v) => ({
        id: v.id,
        text: v.text,
        pages: v.pages,
        hash: v.hash,
      })),
    })),
  });
}

// One-time default migration. Never translate or replace a user's edited work.
export function upgradePreferences(data: WorkspaceData): WorkspaceData {
  if (data.languagePreferenceVersion === 1) return data;
  const original = legacySeedWorkspace().projects[0];
  const english = seedWorkspace().projects[0];
  return {
    ...data,
    language: "en",
    languagePreferenceVersion: 1,
    projects: data.projects.map((project) =>
      project.id === "welcome" &&
      project.example &&
      !project.snapshots.length &&
      demoSignature(project) === demoSignature(original)
        ? {
            ...english,
            id: project.id,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
          }
        : project,
    ),
  };
}
