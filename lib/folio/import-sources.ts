import type { Project, Source } from "./model.ts";

/** Resolve the imported bytes to project sources before assigning them to an option. */
export function importProjectSources(
  project: Project,
  incoming: Source[],
  optionId?: string,
) {
  const comparison = project.comparison;
  const option = comparison?.options.find((o) => o.id === optionId);
  if (optionId && !option)
    throw new Error("方案已移除 / This option no longer exists.");
  const sources = [...project.sources];
  const added: Source[] = [];
  const linked = new Set(option?.sourceIds);
  for (const source of incoming) {
    const hash = source.versions[0].hash;
    const current = sources.filter((s) => s.versions.at(-1)?.hash === hash);
    if (current.length) {
      if (option && current.length > 1)
        throw new Error(
          "多份资料与此文件相同，请从比较表选择 / Multiple sources match this file. Choose the source in the comparison.",
        );
      if (option) linked.add(current[0].id);
      continue;
    }
    if (sources.some((s) => s.versions.some((v) => v.hash === hash))) {
      if (option)
        throw new Error(
          "文件与旧版本相同，请在比较表中确认当前资料 / This file matches an earlier revision. Check the current source in the comparison.",
        );
      continue;
    }
    sources.push(source);
    added.push(source);
    if (option) linked.add(source.id);
  }
  if (sources.length > 20)
    throw new Error("每个项目最多 20 份资料 / Up to 20 sources per project.");
  if (
    sources.reduce(
      (n, s) => n + s.versions.reduce((sum, v) => sum + v.size, 0),
      0,
    ) >
    80 * 1024 * 1024
  )
    throw new Error(
      "每个项目最多 80 MB（含历史版本） / Up to 80 MB per project, including revisions.",
    );
  const changes: Partial<Project> = { sources };
  if (option && comparison)
    changes.comparison = {
      ...comparison,
      options: comparison.options.map((o) =>
        o.id === option.id ? { ...o, sourceIds: [...linked] } : o,
      ),
    };
  if (project.research && added.length)
    changes.research = {
      ...project.research,
      selectedSourceIds: [
        ...project.research.selectedSourceIds,
        ...added.map((s) => s.id),
      ],
    };
  return { changes, added: added.length };
}
