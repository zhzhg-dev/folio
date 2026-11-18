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

export const comparisonQueryLimits = { characters: 500, lines: 3 };

// Keep the persisted query string and its original 500-character allowance.
// Empty configuration still uses the criterion name; never truncate old data.
export function comparisonQueryLines(query: string, fallback = ""): string[] {
  if (query.length > comparisonQueryLimits.characters)
    throw new Error(
      "检索词总计最多 500 字 / Keep search terms within 500 characters in total.",
    );
  const lines = (query.trim() || fallback)
    .split(/\r\n?|\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > comparisonQueryLimits.lines)
    throw new Error(
      "最多填写 3 行检索词 / Use up to 3 non-empty lines of search terms.",
    );
  return [...new Set(lines)];
}

// Historical strings may contain more than three lines. Reading them must not
// block the whole comparison or rewrite the user's persisted words. Treat those
// values as one legacy query; newly entered text still uses strict validation.
export function storedComparisonQuery(criterion: {
  name: string;
  query?: string;
}): string {
  const query = criterion.query?.trim() || criterion.name;
  const lines = query
    .split(/\r\n?|\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > comparisonQueryLimits.lines ? lines.join(" ") : query;
}

/** Each line searches independently. Round-robin ranks give later lines a place
 * in the bounded result, with the entered line order breaking ties. No translation. */
export function searchComparisonPassages(
  project: Project,
  query: string,
  ids: string[],
  limit = 6,
  prepared?: ReturnType<typeof prepareRetrieval>,
): Evidence[] {
  const lines = comparisonQueryLines(query);
  const index = prepared || prepareRetrieval(project, ids);
  const lists = lines.map((line) =>
    retrieve(project, line, ids, undefined, index),
  );
  const seen = new Set<string>();
  const evidence: Evidence[] = [];
  const maximum = Math.min(6, Math.max(0, limit));
  for (
    let rank = 0;
    rank < Math.max(0, ...lists.map((list) => list.length));
    rank++
  ) {
    for (const list of lists) {
      if (evidence.length >= maximum) return evidence;
      const item = list[rank];
      if (!item) continue;
      const key = JSON.stringify([
        item.sourceId,
        item.versionId,
        item.page,
        item.quote,
      ]);
      if (seen.has(key)) continue;
      seen.add(key);
      evidence.push({ ...item, id: `E${evidence.length + 1}` });
    }
  }
  return evidence;
}

export function searchComparisonCell(
  project: Project,
  address: CellAddress,
  query?: string,
): CandidateResult {
  const option = project.comparison?.options.find(
    (o) => o.id === address.optionId,
  );
  const criterion = project.comparison?.criteria.find(
    (c) => c.id === address.criterionId,
  );
  if (!option || !criterion)
    throw new Error(
      "方案或比较维度已移除 / This option or criterion no longer exists.",
    );
  const ids = option.sourceIds.filter((id) =>
    project.sources.some((s) => s.id === id && s.versions.length),
  );
  return {
    ...address,
    linked: ids.length > 0,
    evidence: searchComparisonPassages(
      project,
      query === undefined
        ? storedComparisonQuery(criterion)
        : query.trim() || storedComparisonQuery({ name: criterion.name }),
      ids,
    ),
  };
}

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
        evidence: searchComparisonPassages(
          project,
          storedComparisonQuery(criterion),
          ids,
          3,
          index,
        ),
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
