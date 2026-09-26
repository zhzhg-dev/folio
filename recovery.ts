import { readSavedProjects } from "./lib/folio/recovery-storage";
import { prepareBackup, saveDownload } from "./lib/folio/backup-export";

export async function mountRecoveryBackups(
  host: HTMLElement,
  onBusy: (busy: boolean) => void = () => {},
) {
  const controllers = new Set<AbortController>();
  const stop = () => controllers.forEach((controller) => controller.abort());
  const dispose = () => {
    stop();
    window.removeEventListener("pagehide", stop);
  };
  host.textContent = "Reading saved projects… / 正在读取已保存项目…";
  try {
    const projects = await readSavedProjects();
    host.replaceChildren();
    if (!projects.length) {
      host.textContent =
        "No saved projects at this address. / 此地址没有已保存项目。";
      return dispose;
    }
    const description = document.createElement("p");
    description.textContent =
      "Export one project at a time. Original files and history are included. / 可逐个导出项目，包含原文件和历史记录。";
    host.append(description);
    window.addEventListener("pagehide", stop, { once: true });
    const buttons: HTMLButtonElement[] = [];
    for (const project of projects) {
      const row = document.createElement("div");
      row.className = "recovery-project";
      const name = document.createElement("span");
      name.textContent = project.name;
      const exportButton = document.createElement("button");
      exportButton.textContent = "Export backup · 导出备份";
      buttons.push(exportButton);
      const cancel = document.createElement("button");
      cancel.className = "startup-secondary";
      cancel.textContent = "Cancel · 取消";
      cancel.hidden = true;
      const status = document.createElement("small");
      status.setAttribute("role", "status");
      exportButton.addEventListener("click", async () => {
        onBusy(true);
        buttons.forEach((button) => (button.disabled = true));
        const controller = new AbortController();
        controllers.add(controller);
        cancel.hidden = false;
        cancel.onclick = () => controller.abort();
        status.textContent = "Preparing… / 正在准备…";
        try {
          const blob = await prepareBackup(project, {
            signal: controller.signal,
            onProgress: (done, total) => {
              status.textContent = `${Math.round((done / Math.max(total, 1)) * 100)}%`;
            },
          });
          saveDownload(blob, `${project.name}.folio.json`);
          status.textContent =
            "File ready. Use Save file below. / 文件已准备好，请点击保存文件。";
        } catch {
          status.textContent = controller.signal.aborted
            ? "Canceled. Saved data is unchanged. / 已取消，已保存资料未修改。"
            : "Export failed. Saved data is unchanged. / 导出失败，已保存资料未修改。";
        } finally {
          controllers.delete(controller);
          cancel.hidden = true;
          buttons.forEach((button) => (button.disabled = false));
          onBusy(false);
        }
      });
      row.append(name, exportButton, cancel, status);
      host.append(row);
    }
  } catch {
    host.textContent =
      "Saved projects could not be read. Keep this browser's data and try again later. / 暂时无法读取项目，请保留浏览器数据后重试。";
  }
  return dispose;
}
