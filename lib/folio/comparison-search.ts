import type { Evidence, Project } from "./model.ts";
import { cellStatus } from "./comparison.ts";
import { prepareRetrieval, retrieve } from "./retrieval.ts";

export type CellAddress = { optionId: string; criterionId: string };
export type CandidateResult = CellAddress & {
  evidence: Evidence[];
  linked: boolean;
};
export type ReviewFilter = "all" | ReturnType<typeof cellStatus>;
export const cellKey = (cell: CellAddress) =>
  JSON.stringify([cell.optionId, cell.criterionId]);

// The fingerprint excludes findings: editing a finding cannot invalidate source search.
export function comparisonSearchKey(project: Project) {
  const c = project.comparison;
  return JSON.stringify([
    project.id,
    c?.options,
    c?.criteria,
    project.sources.map((s) => [s.id, s.name, s.versions.at(-1)?.id]),
  ]);
}
export function reviewItems(project: Project, filter: ReviewFilter = "all") {
  const c = project.comparison;
  if (!c) return [];
  const priority = { changed: 0, missing: 1, unreviewed: 2, reviewed: 3 };
  return c.criteria
    .flatMap((criterion) =>
      c.options.map((option) => {
        const cell = c.cells.find(
          (x) => x.optionId === option.id && x.criterionId === criterion.id,
        );
        return {
          optionId: option.id,
          criterionId: criterion.id,
          option: option.name,
          criterion: criterion.name,
          cell,
          status: cellStatus(cell, project),
        };
      }),
    )
    .filter((item) => filter === "all" || item.status === filter)
    .sort((a, b) => priority[a.status] - priority[b.status]);
}
// Runs in one worker. Reuse the tokenized source index across a column's criteria.
export function searchComparison(
  project: Project,
  progress?: (completed: number, total: number) => void,
) {
  const c = project.comparison;
  if (!c) return [];
  const total = c.options.length * c.criteria.length;
  const results: CandidateResult[] = [];
  for (const option of c.options) {
    const ids = option.sourceIds.filter((id) =>
      project.sources.some((s) => s.id === id && s.versions.length),
    );
    const index = prepareRetrieval(project, ids);
    for (const criterion of c.criteria) {
      results.push({
        optionId: option.id,
        criterionId: criterion.id,
        linked: !!ids.length,
        evidence: retrieve(
          project,
          criterion.query?.trim() || criterion.name,
          ids,
          undefined,
          index,
        ).slice(0, 3),
      });
      progress?.(results.length, total);
    }
  }
  return results;
}
export function currentQuote(
  e: Evidence,
  project: Project,
): Evidence | undefined {
  const s = project.sources.find((s) => s.id === e.sourceId);
  const v = s?.versions.at(-1);
  if (!s || !v || v.id === e.versionId || !e.quote.trim()) return;
  // Prefer the same page, but retain an exact match if pagination moved.
  const page =
    v.pages.find((p) => p.page === e.page && p.text.includes(e.quote)) ||
    v.pages.find((p) => p.text.includes(e.quote));
  if (page) return { ...e, versionId: v.id, page: page.page, name: s.name };
}
