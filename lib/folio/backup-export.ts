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
  // File System Access is optional. The explicit picker avoids depending only
  // on blob downloads in browsers that can save directly to a chosen file.
  const picker = (
    window as unknown as {
      showSaveFilePicker?: (options: { suggestedName: string }) => Promise<{
        createWritable: () => Promise<{
          write: (data: Blob) => Promise<void>;
          close: () => Promise<void>;
          abort: () => Promise<void>;
        }>;
      }>;
    }
  ).showSaveFilePicker;
  let saveAs: HTMLButtonElement | undefined;
  if (picker) {
    saveAs = document.createElement("button");
    saveAs.textContent = zh ? "另存为…" : "Save as…";
    saveAs.addEventListener("click", async () => {
      if (saveAs!.disabled) return;
      saveAs!.disabled = true;
      let writable:
        | Awaited<
            ReturnType<
              Awaited<ReturnType<NonNullable<typeof picker>>>["createWritable"]
            >
          >
        | undefined;
      try {
        const handle = await picker.call(window, { suggestedName: a.download });
        writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        label.textContent = zh ? "文件已保存" : "File saved";
      } catch (error) {
        if (writable) await writable.abort().catch(() => {});
        if (!(error instanceof Error && error.name === "AbortError"))
          label.textContent = zh
            ? "另存为未完成，请使用保存文件链接"
            : "Save as did not finish. Try the Save file link";
      } finally {
        saveAs!.disabled = false;
      }
    });
  }
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
  if (saveAs) notice.append(saveAs);
  // Small backups also have a user-visible text path for embedded browsers
  // that block blob downloads. Bound the read and never expose binary exports.
  if (blob.type === "application/json" && blob.size <= 2 * 1024 * 1024) {
    const copy = document.createElement("button");
    copy.textContent = zh ? "复制备份文本" : "Copy backup text";
    copy.addEventListener("click", async () => {
      copy.disabled = true;
      try {
        const text = await blob.text();
        try {
          await navigator.clipboard.writeText(text);
          label.textContent = zh
            ? "备份已复制，请粘贴到文件保存"
            : "Backup copied. Paste into a file to keep it";
        } catch {
          let field = notice.querySelector("textarea");
          if (!field) {
            field = document.createElement("textarea");
            field.readOnly = true;
            field.setAttribute("aria-label", zh ? "备份文本" : "Backup text");
            notice.append(field);
          }
          field.value = text;
          field.focus();
          field.select();
          label.textContent = zh
            ? "请复制选中的备份文本"
            : "Copy the selected backup text";
        }
      } finally {
        copy.disabled = false;
      }
    });
    notice.append(copy);
  }
  // A visible, user-activated link works after asynchronous preparation, too.
  (
    document.querySelector('[role="dialog"][data-state="open"]') ||
    document.body
  ).append(notice);
}
