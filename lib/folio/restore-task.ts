import type { Project } from "./model.ts";
export function restoreBackupAsync(
  file: File,
  signal: AbortSignal,
): Promise<Project> {
  if (file.size > 150 * 1024 * 1024)
    return Promise.reject(new Error("备份过大 / Backup too large"));
  return new Promise((resolve, reject) => {
    if (signal.aborted)
      return reject(new DOMException("Canceled", "AbortError"));
    const worker = new Worker(new URL("./restore.worker.ts", import.meta.url), {
      type: "module",
    });
    let done = false;
    const finish = (project?: Project, error?: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      worker.terminate();
      if (project) resolve(project);
      else reject(error);
    };
    const cancel = () =>
      finish(undefined, new DOMException("Canceled", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(
          undefined,
          new Error(
            "恢复超时，请使用较小的备份重试。 / Restore timed out. Try a smaller backup.",
          ),
        ),
      120_000,
    );
    signal.addEventListener("abort", cancel, { once: true });
    worker.onmessage = ({ data }) =>
      data.project
        ? finish(data.project)
        : finish(undefined, new Error(data.error || "Invalid backup"));
    worker.onerror = () =>
      finish(
        undefined,
        new Error(
          "恢复未完成，原项目未改动。 / Restore failed. Your existing projects are unchanged.",
        ),
      );
    try {
      worker.postMessage({ file });
    } catch (error) {
      finish(undefined, error);
    }
  });
}
