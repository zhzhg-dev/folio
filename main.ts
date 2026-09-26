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
window.addEventListener("pagehide", () => session.finish());
window.addEventListener("pageshow", (e) => {
  if (e.persisted && started) session.start();
});

async function openWorkspace(safe: boolean) {
  if (started) return;
  started = true;
  if (safe) document.documentElement.dataset.folioSafe = "true";
  session.start();
  root.innerHTML =
    '<main class="startup"><p role="status">Opening workspace… / 正在打开工作区…</p></main>';
  try {
    const { renderWorkspace } = await import("./render");
    renderWorkspace(root);
  } catch {
    started = false;
    showRecovery(true);
  }
}

function showRecovery(failed = false) {
  root.innerHTML = `<main class="startup"><section>
    <span class="startup-brand">Folio.</span>
    <h1>${failed ? "Your workspace could not open." : "Open with fewer background tasks."}</h1>
    <p>${failed ? "Check your connection and try again. Your saved work has not been changed." : "Startup protection is active. PDF previews and browser integrations will stay paused. Your saved work is unchanged."}</p>
    <p lang="zh-CN">${failed ? "工作区暂时无法打开，请检查网络后重试。已保存的资料未被修改。" : "启动保护已开启。PDF 预览和浏览器集成暂不自动运行，已保存的资料不会被修改。"}</p>
    <button type="button">Open workspace safely · 安全打开</button>
    <small>You can leave this page open without loading the workspace.<br>停留在此页不会加载工作区。</small>
  </section></main>`;
  root
    .querySelector("button")!
    .addEventListener("click", () => void openWorkspace(true));
}

if (session.needsRecovery) showRecovery();
else void openWorkspace(false);
