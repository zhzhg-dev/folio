import { startupSession } from "./lib/folio/startup";
import "./app/startup.css";

const root = document.getElementById("root")!;
const forced = new URLSearchParams(location.search).get("safe") === "1";
// A previous interrupted session shows a lightweight page before importing React,
// the editor, PDF code, fonts or optional browser integrations.
let storage: Storage;
try {
  storage = localStorage;
} catch {
  storage = {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {},
  } as unknown as Storage;
}
const session = startupSession(storage, crypto.randomUUID(), forced);
let started = false;
let attempt = 0;
let startupTimer: ReturnType<typeof setTimeout> | undefined;
let disposeWorkspace: (() => void) | undefined;
let disposeRecovery: (() => void) | undefined;
window.addEventListener("pagehide", () => session.finish());
window.addEventListener("pageshow", (e) => {
  if (e.persisted && started) session.start();
});

async function openWorkspace(safe: boolean) {
  if (started) return;
  started = true;
  disposeRecovery?.();
  disposeRecovery = undefined;
  const current = ++attempt;
  if (safe) document.documentElement.dataset.folioSafe = "true";
  session.start();
  root.innerHTML =
    '<main class="startup"><p role="status">Opening workspace… / 正在打开工作区…</p></main>';
  const failed = () => {
    if (current !== attempt) return;
    attempt++;
    session.failed();
    started = false;
    clearTimeout(startupTimer);
    queueMicrotask(() => {
      disposeWorkspace?.();
      disposeWorkspace = undefined;
      showRecovery(true);
    });
  };
  startupTimer = setTimeout(failed, 15_000);
  try {
    const { renderWorkspace } = await import("./render");
    if (current !== attempt) return;
    disposeWorkspace = renderWorkspace(root, {
      onReady: () => {
        if (current === attempt) clearTimeout(startupTimer);
      },
      onFailure: failed,
    });
  } catch {
    failed();
  }
}

function showRecovery(failed = false) {
  root.innerHTML = `<main class="startup"><section>
    <span class="startup-brand">Folio.</span>
    <h1>${failed ? "Your workspace could not open." : "Open with fewer background tasks."}</h1>
    <p>${failed ? "Retry safely or export your saved projects below. Your saved work has not been changed." : "Startup protection is active. PDF previews and browser integrations will stay paused. Your saved work is unchanged."}</p>
    <p lang="zh-CN">${failed ? "可以安全重试，或在下方导出项目备份。已保存的资料未被修改。" : "启动保护已开启。PDF 预览和浏览器集成暂不自动运行，已保存的资料不会被修改。"}</p>
    <button type="button" data-open>Open workspace safely · 安全打开</button>
    <button type="button" class="startup-secondary" data-backup>Export saved projects · 导出已保存项目</button>
    <small>You can leave this page open without loading the workspace.<br>停留在此页不会加载工作区。</small>
    <div class="recovery-backups" data-projects></div>
  </section></main>`;
  root
    .querySelector("[data-open]")!
    .addEventListener("click", () => void openWorkspace(true));
  root
    .querySelector<HTMLButtonElement>("[data-backup]")!
    .addEventListener("click", async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      root.querySelector<HTMLButtonElement>("[data-open]")!.disabled = true;
      const host = root.querySelector<HTMLElement>("[data-projects]")!;
      try {
        const { mountRecoveryBackups } = await import("./recovery");
        // Stay on the lightweight surface while any recovery export is running.
        disposeRecovery = await mountRecoveryBackups(host, (busy) => {
          const open = root.querySelector<HTMLButtonElement>("[data-open]");
          if (open) open.disabled = busy;
        });
      } catch {
        host.textContent =
          "Backup tools could not load. Try again. / 备份工具未加载，请重试。";
        button.disabled = false;
      } finally {
        const open = root.querySelector<HTMLButtonElement>("[data-open]");
        if (open) open.disabled = false;
      }
    });
}

if (session.needsRecovery) showRecovery();
else void openWorkspace(false);
