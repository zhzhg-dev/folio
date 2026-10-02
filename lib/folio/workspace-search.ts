import { plainText, type Project } from "./model.ts";
import { notebookFor } from "./notebook.ts";
import { isActiveProject } from "./projects.ts";

export type SearchKind =
  "project" | "question" | "finding" | "source" | "brief";
export type SearchDocument = {
  projectId: string;
  projectName: string;
  kind: SearchKind;
  id: string;
  title: string;
  text: string;
  questionId?: string;
  sourceId?: string;
  versionId?: string;
  page?: number;
};
export type SearchHit = Omit<SearchDocument, "text"> & {
  snippet: string;
  quote?: string;
};
export const searchLimits = {
  characters: 8_000_000,
  documents: 20_000,
  results: 60,
};
// Explicit search DTO: no file blobs, source history, account data or archived work.
export function workspaceSearchInput(
  projects: Project[],
  scopeId = "",
): SearchDocument[] {
  const docs: SearchDocument[] = [];
  let size = 0;
  const add = (doc: SearchDocument) => {
    size += doc.text.length + doc.title.length;
    if (size > searchLimits.characters || docs.length >= searchLimits.documents)
      throw new Error(
        "搜索内容较多，请选择一个较小的项目 / Too much content to search at once. Select a smaller project.",
      );
    docs.push(doc);
  };
  for (const p of projects.filter(
    (p) => isActiveProject(p) && (!scopeId || p.id === scopeId),
  )) {
    const base = { projectId: p.id, projectName: p.name };
    const notebook = notebookFor(p);
    add({
      ...base,
      kind: "project",
      id: p.id,
      title: p.name,
      text: [p.description, p.reportTitle, notebook.objective].join("\n"),
    });
    for (const q of notebook.questions)
      add({
        ...base,
        kind: "question",
        id: q.id,
        questionId: q.id,
        title: q.title,
        text: "",
      });
    for (const f of notebook.findings)
      add({
        ...base,
        kind: "finding",
        id: f.id,
        questionId: f.questionId,
        title: f.value,
        text: [f.note, ...f.evidence.map((e) => e.quote)].join("\n"),
      });
    for (const s of p.sources) {
      const v = s.versions.at(-1);
      if (!v) continue;
      for (const page of v.pages)
        add({
          ...base,
          kind: "source",
          id: s.id + ":" + page.page,
          title: s.name,
          sourceId: s.id,
          versionId: v.id,
          page: page.page,
          text: page.text,
        });
    }
    add({
      ...base,
      kind: "brief",
      id: p.id,
      title: p.reportTitle || p.name,
      text: plainText(p.content),
    });
  }
  return docs;
}
export function searchWorkspace(
  docs: SearchDocument[],
  query: string,
  kind: SearchKind | "all" = "all",
) {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12);
  const matches: { hit: SearchHit; score: number }[] = [];
  for (const d of docs) {
    if (kind !== "all" && d.kind !== kind) continue;
    if (!terms.length && kind === "all" && d.kind !== "project") continue;
    const title = d.title.toLowerCase(),
      text = d.text.toLowerCase();
    if (!terms.every((term) => title.includes(term) || text.includes(term)))
      continue;
    const at =
      terms
        .map((term) => text.indexOf(term))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b)[0] ?? 0;
    const previousBreak = d.text.lastIndexOf("\n\n", at);
    const start = Math.max(
      0,
      at - 65,
      previousBreak < 0 ? 0 : previousBreak + 2,
    );
    const paragraphEnd = d.text.indexOf("\n\n", at);
    const end = Math.min(
      start + 240,
      paragraphEnd < 0 ? d.text.length : paragraphEnd,
    );
    const passage = d.text.slice(start, end);
    const { text: _text, ...target } = d;
    matches.push({
      hit: {
        ...target,
        title: d.title.slice(0, 240),
        snippet:
          (start ? "…" : "") + passage + (end < d.text.length ? "…" : ""),
        quote: d.kind === "source" ? passage : undefined,
      },
      score: terms.reduce(
        (n, term) => n + (title === term ? 10 : title.includes(term) ? 4 : 1),
        0,
      ),
    });
  }
  matches.sort((a, b) => b.score - a.score);
  return {
    hits: matches.slice(0, searchLimits.results).map((m) => m.hit),
    total: matches.length,
  };
}

export function searchTargetExists(project: Project, hit: SearchHit): boolean {
  if (project.id !== hit.projectId || !isActiveProject(project)) return false;
  const n = notebookFor(project);
  if (hit.kind === "question") return n.questions.some((q) => q.id === hit.id);
  if (hit.kind === "finding")
    return n.findings.some(
      (f) => f.id === hit.id && f.questionId === hit.questionId,
    );
  if (hit.kind === "source")
    return !!project.sources
      .find((s) => s.id === hit.sourceId)
      ?.versions.find((v) => v.id === hit.versionId)
      ?.pages.some(
        (p) =>
          p.page === hit.page && (!hit.quote || p.text.includes(hit.quote)),
      );
  return true;
}
