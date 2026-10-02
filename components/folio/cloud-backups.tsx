"use client";
import { useEffect, useRef, useState } from "react";
import {
  Cloud,
  CloudUpload,
  RefreshCw,
  RotateCcw,
  Trash2,
  Loader2,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import type { Language, Project } from "@/lib/folio/model";
import type {
  CloudBackup,
  CloudLibrary,
  CloudSession,
} from "@/lib/folio/cloud-contract";
import { CLOUD_LIMITS } from "@/lib/folio/cloud-contract";
import {
  cloudSession,
  cloudLibrary,
  uploadCloudBackup,
  downloadCloudBackup,
  deleteCloudBackup,
  cloudErrorText,
  CloudError,
} from "@/lib/folio/cloud-client";
import { prepareBackup } from "@/lib/folio/backup-export";
import { restoreBackupAsync } from "@/lib/folio/restore-task";

const size = (bytes: number) =>
  bytes === 0
    ? "0 KB"
    : bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export default function CloudBackups({
  project,
  language,
  onRestore,
}: {
  project: Project;
  language: Language;
  onRestore: (project: Project) => void;
}) {
  const zh = language === "zh";
  const t = (cn: string, en: string) => (zh ? cn : en);
  const [session, setSession] = useState<CloudSession>();
  const [library, setLibrary] = useState<CloudLibrary>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const operation = useRef<AbortController | null>(null);
  const live = useRef(true);
  const accountKey = useRef<string | undefined>(undefined);
  const canceled = useRef(false);
  async function identify(signal: AbortSignal, expected?: string) {
    const next = await cloudSession(signal);
    signal.throwIfAborted();
    if (next.account?.key !== accountKey.current) {
      setLibrary(undefined);
      setConfirmDelete(undefined);
    }
    accountKey.current = next.account?.key;
    setSession(next);
    if (expected && next.account?.key !== expected)
      throw new CloudError("account_changed");
    return next;
  }
  async function refresh(signal: AbortSignal, expected?: string) {
    const next = await identify(signal, expected);
    if (!next.available) throw new CloudError("unavailable");
    if (next.account) {
      const data = await cloudLibrary(next.account.key, signal);
      signal.throwIfAborted();
      setLibrary(data);
    }
  }
  async function run(
    label: string,
    action: (signal: AbortSignal) => Promise<void>,
  ) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    canceled.current = false;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action(controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted && live.current)
        setError(cloudErrorText(failure, zh));
    } finally {
      if (operation.current === controller) operation.current = null;
      if (live.current) {
        setBusy("");
        if (canceled.current) {
          setNotice(
            t(
              "已停止等待。服务器可能已经保存，请刷新列表确认。",
              "Stopped waiting. The server may have saved the backup; refresh to check.",
            ),
          );
          setLibrary(undefined);
        }
      }
    }
  }
  useEffect(() => {
    live.current = true;
    void run("loading", (signal) => refresh(signal));
    return () => {
      live.current = false;
      operation.current?.abort();
      operation.current = null;
    };
    // This panel loads only when the user opens Account & cloud.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const save = () =>
    run("saving", async (signal) => {
      const expected = session?.account?.key;
      if (!expected) throw new CloudError("sign_in");
      await identify(signal, expected);
      const originals = project.sources.reduce(
        (n, source) =>
          n +
          source.versions.reduce(
            (sum, version) =>
              sum + Math.ceil((version.original?.size || 0) / 3) * 4,
            0,
          ),
        0,
      );
      if (originals > CLOUD_LIMITS.backupBytes)
        throw new CloudError("too_large");
      const blob = await prepareBackup(project, { signal });
      await uploadCloudBackup(blob, crypto.randomUUID(), expected, signal);
      await refresh(signal, expected);
      setNotice(
        t(
          "云端版本已保存。后续修改请再次保存。",
          "Cloud version saved. Save again after making further changes.",
        ),
      );
    });
  const restore = (backup: CloudBackup) =>
    run(`restore:${backup.id}`, async (signal) => {
      const expected = session?.account?.key;
      if (!expected) throw new CloudError("sign_in");
      await identify(signal, expected);
      const file = await downloadCloudBackup(backup, expected, signal);
      const copy = await restoreBackupAsync(file, signal);
      await identify(signal, expected);
      signal.throwIfAborted();
      onRestore(copy);
      setNotice(
        t("已恢复为新的本机项目。", "Restored as a new local project."),
      );
    });
  const remove = (id: string) =>
    run(`delete:${id}`, async (signal) => {
      const expected = session?.account?.key;
      if (!expected) throw new CloudError("sign_in");
      await identify(signal, expected);
      await deleteCloudBackup(id, expected, signal);
      setConfirmDelete(undefined);
      await refresh(signal, expected);
      setNotice(
        t(
          "已删除云端版本，本机项目未改动。",
          "Cloud version deleted. Local projects are unchanged.",
        ),
      );
    });
  return (
    <section
      className="cloud-panel"
      aria-label={t("账号与云备份", "Account and cloud backups")}
    >
      <div className="cloud-heading">
        <span className="cloud-mark">
          <Cloud size={22} />
        </span>
        <div>
          <h3>{t("随身携带你的研究", "Your research, within reach")}</h3>
          <p>
            {t(
              "按需保存，在另一台设备继续。",
              "Save a version. Pick it up on another device.",
            )}
          </p>
        </div>
      </div>
      {session?.account ? (
        <div className="cloud-account">
          <span className="cloud-avatar">
            {session.account.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{session.account.name}</strong>
            <span>{session.account.email}</span>
          </div>
          {!busy && (
            <a className="text-action" href={session.signOut} target="_top">
              <LogOut size={14} />
              {t("退出", "Sign out")}
            </a>
          )}
        </div>
      ) : (
        session && (
          <div className="cloud-signin">
            <p>
              {t(
                "登录只用于访问云备份，不会自动上传资料。",
                "Signing in gives you access to cloud backups. Nothing uploads automatically.",
              )}
            </p>
            <a className="primary-button" href={session.signIn} target="_top">
              {t("使用 ChatGPT 登录", "Sign in with ChatGPT")}
            </a>
          </div>
        )
      )}
      {session?.account && session.available && (
        <>
          <div className="cloud-save">
            <div>
              <span className="cloud-eyebrow">
                {t("当前项目", "CURRENT PROJECT")}
              </span>
              <strong>{project.name}</strong>
              <p>
                {t(
                  "包含原文件、引用、笔记和文档版本。",
                  "Includes originals, citations, notes and document versions.",
                )}
              </p>
            </div>
            <button
              className="primary-button"
              disabled={!!busy || !library}
              onClick={save}
            >
              <CloudUpload size={16} />
              {t("保存到云端", "Save to cloud")}
            </button>
          </div>
          <div className="cloud-library-heading">
            <h4>{t("云端版本", "Cloud versions")}</h4>
            <button
              className="text-action"
              disabled={!!busy}
              onClick={() => run("loading", (signal) => refresh(signal))}
            >
              <RefreshCw size={14} />
              {t("刷新", "Refresh")}
            </button>
          </div>
          {library && (
            <p className="cloud-quota">
              {library.usedCount} / {session.limits.count}{" "}
              {t("个版本", "versions")} · {size(library.usedBytes)} /{" "}
              {size(session.limits.accountBytes)} · {t("单次最多", "Up to")}{" "}
              {size(session.limits.backupBytes)} {t("每个备份", "per backup")}
            </p>
          )}
          {library && library.usedCount > library.backups.length && (
            <p className="cloud-quota">
              {t(
                "有版本仍在处理中。未完成的占用会在一小时后刷新时释放。",
                "A version is still processing. Unfinished reservations clear on refresh after one hour.",
              )}
            </p>
          )}
          {library?.backups.length === 0 && (
            <div className="cloud-empty">
              <Cloud size={23} />
              <strong>
                {t(
                  "第一份备份，从这里开始",
                  "A safe place for your first backup",
                )}
              </strong>
              <p>
                {t(
                  "保存后，同一账号登录即可找到。",
                  "Once saved, your versions appear on any device signed into this account.",
                )}
              </p>
            </div>
          )}
          <div className="cloud-list">
            {library?.backups.map((backup) => (
              <article key={backup.id} className="cloud-version">
                <div>
                  <strong>{backup.name}</strong>
                  <span>
                    {new Date(backup.createdAt).toLocaleString(
                      zh ? "zh-CN" : "en",
                      { dateStyle: "medium", timeStyle: "short" },
                    )}{" "}
                    · {size(backup.bytes)}
                  </span>
                </div>
                <div className="cloud-version-actions">
                  <button
                    className="secondary-button"
                    disabled={!!busy}
                    onClick={() => restore(backup)}
                  >
                    <RotateCcw size={14} />
                    {t("恢复副本", "Restore copy")}
                  </button>
                  <button
                    className="cloud-delete"
                    disabled={!!busy}
                    aria-label={t(
                      `删除 ${backup.name} 的云备份`,
                      `Delete cloud backup of ${backup.name}`,
                    )}
                    onClick={() => setConfirmDelete(backup.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {confirmDelete === backup.id && (
                  <div
                    className="cloud-confirm"
                    role="group"
                    aria-label={t("确认删除云端版本", "Confirm cloud deletion")}
                  >
                    <p>
                      {t(
                        "永久删除此云端版本？本机副本会保留。",
                        "Permanently delete this cloud version? Local copies will remain.",
                      )}
                    </p>
                    <button
                      className="secondary-button"
                      disabled={!!busy}
                      onClick={() => setConfirmDelete(undefined)}
                    >
                      {t("取消", "Cancel")}
                    </button>
                    <button
                      className="secondary-button cloud-danger"
                      disabled={!!busy}
                      onClick={() => remove(backup.id)}
                    >
                      {t("删除云端版本", "Delete cloud version")}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {busy && (
        <div className="cloud-status" role="status">
          <Loader2 className="spin" size={16} />
          <span>
            {busy === "loading"
              ? t("正在连接云端…", "Connecting to your cloud library…")
              : busy === "saving"
                ? t("正在准备并保存版本…", "Preparing and saving your version…")
                : busy.startsWith("restore")
                  ? t(
                      "正在下载并校验备份…",
                      "Downloading and verifying the backup…",
                    )
                  : t("正在删除…", "Deleting…")}
          </span>
          <button
            className="text-action"
            onClick={() => {
              canceled.current = true;
              operation.current?.abort();
            }}
          >
            {t("停止等待", "Stop waiting")}
          </button>
        </div>
      )}
      {notice && (
        <p className="cloud-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="cloud-error" role="alert">
          <p>{error}</p>
          <button
            className="secondary-button"
            disabled={!!busy}
            onClick={() => run("loading", (signal) => refresh(signal))}
          >
            {t("重新连接", "Reconnect")}
          </button>
        </div>
      )}
      <div className="cloud-privacy">
        <ShieldCheck size={16} />
        <p>
          {t(
            "手动云备份，不会自动同步。恢复会新建本机副本。退出账号不会移除这台设备上的资料。",
            "Cloud backups are manual. Restoring creates a local copy. Signing out does not remove work from this device.",
          )}
        </p>
      </div>
    </section>
  );
}
