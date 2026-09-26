import type { Project } from "./model.ts";
import type { CandidateResult } from "./comparison-search.ts";
import { researchInput } from "./research-task.ts";

export function findComparisonCandidates(
  project: Project,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void,
): Promise<CandidateResult[]> {
  const ids = [
    ...new Set(project.comparison?.options.flatMap((o) => o.sourceIds) || []),
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
        "批量检索资料过大，请减少关联资料或逐项检索。 / Too much text for batch search. Link fewer sources or search one finding at a time.",
      ),
    );
  input.comparison = project.comparison && { ...project.comparison, cells: [] };
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
      60_000,
    );
    signal.addEventListener("abort", cancel, { once: true });
    worker.onmessage = ({ data }) => {
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
      worker.postMessage({ project: input });
    } catch (error) {
      finish(undefined, error);
    }
  });
}
