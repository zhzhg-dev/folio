import type { Project } from "./model";
import { buildBackupBlob, type BackupOptions } from "./backup.ts";

export function prepareBackup(
  project: Project,
  options: BackupOptions = {},
): Promise<Blob> {
  if (typeof Worker === "undefined") return buildBackupBlob(project, options);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./backup.worker.ts", import.meta.url), {
      type: "module",
    });
    const dispose = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      worker.terminate();
    };
    const fail = () => {
      dispose();
      reject(
        new Error(
          "备份未完成，原资料未修改。 / Backup did not finish. Saved data is unchanged.",
        ),
      );
    };
    const cancel = () => {
      dispose();
      reject(options.signal?.reason || new Error("Backup canceled"));
    };
    const timer = setTimeout(fail, 120_000);
    if (options.signal?.aborted) {
      cancel();
      return;
    }
    options.signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress")
        options.onProgress?.(data.completed, data.total);
      if (data.type === "done") {
        dispose();
        resolve(data.blob);
      }
      if (data.type === "error") fail();
    };
    worker.onerror = fail;
    try {
      worker.postMessage(project);
    } catch {
      fail();
    }
  });
}

export function saveDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[<>:"/\\|?*]/g, "-");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
