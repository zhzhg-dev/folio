"use client";
import { useEffect, useState } from "react";
import type { Language } from "@/lib/folio/model";
import { lastSaveDetails } from "@/lib/folio/storage";
import { sessionDiagnostics } from "@/lib/folio/diagnostics";

export default function StorageHealth({ language }: { language: Language }) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [usage, setUsage] = useState<number>();
  const [persisted, setPersisted] = useState<boolean>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = lastSaveDetails();
  const performance = sessionDiagnostics();
  useEffect(() => {
    let canceled = false;
    void navigator.storage
      ?.estimate?.()
      .then((result) => {
        if (!canceled) setUsage(result.usage);
      })
      .catch(() => {});
    void navigator.storage
      ?.persisted?.()
      .then((result) => {
        if (!canceled) setPersisted(result);
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, []);
  return (
    <div className="storage-health">
      <div className="storage-health-title">
        <strong>{t("本机存储", "On this device")}</strong>
        <span>
          {usage === undefined
            ? t("占用空间不可用", "Usage unavailable")
            : `${(usage / 1024 / 1024).toFixed(1)} MB`}
        </span>
      </div>
      <p>
        {t(
          "空间占用包含资料和离线资源。本机存储不等于备份，清理浏览器数据仍会删除资料。",
          "Usage includes your work and offline resources. Local storage is not a backup; clearing browser data still removes your work.",
        )}
      </p>
      <div className="storage-protection">
        <span>
          {persisted === true
            ? t("浏览器已允许持久存储", "Persistent storage granted")
            : t(
                "可申请减少浏览器自动清理",
                "Request protection from automatic eviction",
              )}
        </span>
        {persisted !== true && (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const granted = await navigator.storage?.persist?.();
                setPersisted(!!granted);
                setMessage(
                  granted
                    ? t(
                        "已获准。请仍保留独立备份。",
                        "Granted. Keep an independent backup too.",
                      )
                    : t(
                        "浏览器未授予权限，资料仍可正常保存。请定期备份。",
                        "Your browser did not grant persistence. Saving still works; keep regular backups.",
                      ),
                );
              } catch {
                setMessage(
                  t(
                    "暂时无法申请，请保留独立备份。",
                    "Request unavailable. Keep an independent backup.",
                  ),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("申请保护", "Request protection")}
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      <details className="storage-details">
        <summary>{t("保存诊断", "Save diagnostics")}</summary>
        <p>
          {performance.supported
            ? t(
                `本次会话记录到 ${performance.longTasks} 次主线程长任务，最长 ${performance.longestTask} ms。`,
                `${performance.longTasks} main-thread long tasks in this session; longest ${performance.longestTask} ms.`,
              )
            : t(
                "此浏览器不提供长任务指标。",
                "Long-task metrics are unavailable in this browser.",
              )}
        </p>
        <p>
          {latest
            ? `${t("最近一次保存", "Last save")}: ${latest.milliseconds} ms · ${latest.projects} ${t("个项目", "projects")} · ${latest.sources} ${t("份资料写入", "source writes")}`
            : t(
                "本次会话尚无成功保存记录。",
                "No completed save in this session.",
              )}
        </p>
        <p>
          {t(
            "修改笔记不会重写未变化的原始资料。此处的诊断只保存在本次会话中。",
            "Editing a note does not rewrite unchanged source files. These diagnostics stay in this session.",
          )}
        </p>
      </details>
    </div>
  );
}
