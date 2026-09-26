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

let closeDownload: (() => void) | undefined;
import.meta.hot?.dispose(() => closeDownload?.());
export function saveDownload(blob: Blob, name: string) {
  closeDownload?.();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[<>:"/\\|?*]/g, "-");
  const zh = document.documentElement.lang.startsWith("zh");
  const notice = document.createElement("aside");
  notice.className = "download-notice";
  notice.setAttribute("role", "status");
  const label = document.createElement("strong");
  label.textContent = zh ? "文件已准备好" : "Your file is ready";
  const filename = document.createElement("span");
  filename.textContent = a.download;
  a.textContent = zh ? "保存文件" : "Save file";
  const close = document.createElement("button");
  close.textContent = zh ? "关闭" : "Dismiss";
  const dispose = () => {
    notice.remove();
    URL.revokeObjectURL(url);
    window.removeEventListener("pagehide", dispose);
    if (closeDownload === dispose) closeDownload = undefined;
  };
  close.addEventListener("click", dispose);
  closeDownload = dispose;
  window.addEventListener("pagehide", dispose, { once: true });
  notice.append(label, filename, a, close);
  // A visible, user-activated link works after asynchronous preparation, too.
  (
    document.querySelector('[role="dialog"][data-state="open"]') ||
    document.body
  ).append(notice);
}
