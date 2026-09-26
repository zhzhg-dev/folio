import type { Project, ResearchTurn } from "./model.ts";

// Do not clone editor history, original files, or old revisions into the worker.
export function researchInput(project: Project, ids: string[]): Project {
  return {
    ...project,
    content: { type: "doc", content: [] },
    snapshots: [],
    research: undefined,
    sources: project.sources.map((s) => ({
      ...s,
      versions: ids.includes(s.id)
        ? s.versions.slice(-1).map(({ original, ...v }) => ({ ...v, text: "" }))
        : [],
    })),
  };
}

export function findPassagesAsync(
  project: Project,
  question: string,
  ids: string[],
  previousQuestion?: string,
  signal?: AbortSignal,
): Promise<ResearchTurn> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const worker = new Worker(
      new URL("./research.worker.ts", import.meta.url),
      { type: "module" },
    );
    let finished = false;
    const finish = (result?: ResearchTurn, error?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
      if (result) resolve(result);
      else reject(error);
    };
    const cancel = () =>
      finish(undefined, signal?.reason || new Error("Search canceled"));
    const timer = setTimeout(
      () =>
        finish(
          undefined,
          new Error(
            "检索超时，请缩小资料范围。 / Search timed out. Select fewer sources and try again.",
          ),
        ),
      15_000,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = ({ data }) =>
      data.turn
        ? finish(data.turn)
        : finish(
            undefined,
            new Error(
              "检索未完成，请重试。 / Search did not finish. Try again.",
            ),
          );
    worker.onerror = () =>
      finish(
        undefined,
        new Error("无法启动检索，请重试。 / Could not run search. Try again."),
      );
    try {
      worker.postMessage({
        project: researchInput(project, ids),
        question,
        ids,
        previousQuestion,
      });
    } catch (error) {
      finish(undefined, error);
    }
  });
}
