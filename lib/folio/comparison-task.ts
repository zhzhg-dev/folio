import type { Evidence, Project } from "./model.ts";
import {
  comparisonQueryLines,
  storedComparisonQuery,
  type CandidateResult,
  type CellAddress,
} from "./comparison-search.ts";
import { researchInput } from "./research-task.ts";

function runComparisonSearch(
  project: Project,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void,
  cell?: { address: CellAddress; query?: string },
): Promise<CandidateResult[]> {
  if (signal.aborted)
    return Promise.reject(new DOMException("Canceled", "AbortError"));
  const comparison = project.comparison;
  const option =
    cell && comparison?.options.find((o) => o.id === cell.address.optionId);
  const criterion =
    cell && comparison?.criteria.find((c) => c.id === cell.address.criterionId);
  try {
    if (cell) {
      if (!option || !criterion)
        throw new Error(
          "方案或比较维度已移除 / This option or criterion no longer exists.",
        );
      comparisonQueryLines(
        cell.query === undefined
          ? storedComparisonQuery(criterion)
          : cell.query,
        storedComparisonQuery({ name: criterion.name }),
      );
    } else
      for (const c of comparison?.criteria || [])
        comparisonQueryLines(storedComparisonQuery(c));
  } catch (error) {
    return Promise.reject(error);
  }
  const ids = [
    ...new Set(
      cell && option
        ? option.sourceIds
        : comparison?.options.flatMap((o) => o.sourceIds) || [],
    ),
  ];
  const input = researchInput(project, ids);
  const length = input.sources.reduce(
    (n, s) =>
      n +
      (s.versions[0]?.pages.reduce((sum, p) => sum + p.text.length, 0) || 0),
    0,
  );
  // Bound worker cloning and indexing before allocation, independent of original file sizes.
  if (length > 8_000_000)
    return Promise.reject(
      new Error(
        "检索资料过大，请减少关联资料或直接查看原文。 / Too much text for search. Link fewer sources or read the original.",
      ),
    );
  input.comparison = comparison && {
    ...comparison,
    ...(cell && option && criterion
      ? { options: [option], criteria: [criterion] }
      : {}),
    cells: [],
  };
  return new Promise((resolve, reject) => {
    if (signal.aborted)
      return reject(new DOMException("Canceled", "AbortError"));
    const worker = new Worker(
      new URL("./comparison.worker.ts", import.meta.url),
      { type: "module" },
    );
    let finished = false;
    const finish = (results?: CandidateResult[], error?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      worker.terminate();
      if (results) resolve(results);
      else reject(error);
    };
    const cancel = () =>
      finish(undefined, new DOMException("Canceled", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(
          undefined,
          new Error(
            "检索超时，请减少关联资料。 / Search timed out. Link fewer sources and try again.",
          ),
        ),
      cell ? 15_000 : 60_000,
    );
    signal.addEventListener("abort", cancel, { once: true });
    worker.onmessage = ({ data }) => {
      if (finished || signal.aborted) return;
      if (data.results) finish(data.results);
      else if (data.error)
        finish(
          undefined,
          new Error("检索失败，请重试。 / Search failed. Please try again."),
        );
      else progress(data.completed, data.total);
    };
    worker.onerror = () =>
      finish(undefined, new Error("无法启动检索。 / Could not start search."));
    try {
      worker.postMessage({ project: input, ...(cell ? { cell } : {}) });
    } catch (error) {
      finish(undefined, error);
    }
  });
}

export function findComparisonCandidates(
  project: Project,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void,
): Promise<CandidateResult[]> {
  return runComparisonSearch(project, signal, progress);
}

export async function findComparisonCellCandidates(
  project: Project,
  address: CellAddress,
  query: string | undefined,
  signal: AbortSignal,
): Promise<Evidence[]> {
  const results = await runComparisonSearch(project, signal, () => {}, {
    address,
    query,
  });
  return results[0]?.evidence || [];
}
