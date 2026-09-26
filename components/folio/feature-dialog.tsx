"use client";
import { useState, useRef, useEffect } from "react";
import {
  Upload,
  FileText,
  ArrowUpRight,
  ShieldCheck,
  Download,
  Loader2,
  Check,
  RotateCcw,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { readFile, sourceFromText, exportBackup } from "@/lib/folio/files";
import { restoreBackupAsync } from "@/lib/folio/restore-task";
import { errorMessage } from "@/lib/folio/i18n";
import type { Project, Source, Language } from "@/lib/folio/model";
export default function FeatureDialog({
  kind,
  project,
  language,
  updateSourceId,
  onImport,
  onRestore,
  onSnapshot,
  onLanguage,
  onClose,
}: {
  kind: string;
  project: Project;
  language: Language;
  updateSourceId: string | null;
  onImport: (sources: Source[], updateId: string | null) => void;
  onRestore: (project: Project) => void;
  onSnapshot: (name: string) => void;
  onLanguage: () => void;
  onClose: () => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [backupText, setBackupText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const restoreJob = useRef<AbortController | null>(null);
  useEffect(() => () => restoreJob.current?.abort(), []);
  const input = useRef<HTMLInputElement>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const perform = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  };
  const importFiles = (files: FileList | File[]) =>
    perform(async () => {
      if (!files.length) return;
      if (updateSourceId && files.length !== 1)
        throw new Error(
          t("更新资料时请选择一个文件", "Select one file to update a source"),
        );
      if (!updateSourceId && project.sources.length + files.length > 20)
        throw new Error(
          t("每个项目最多 20 份资料", "Up to 20 sources per project"),
        );
      const sources: Source[] = [];
      for (const file of Array.from(files)) sources.push(await readFile(file));
      onImport(sources, updateSourceId);
      onClose();
    });
  const restore = (file?: File) =>
    perform(async () => {
      if (!file) return;
      restoreJob.current?.abort();
      const controller = new AbortController();
      restoreJob.current = controller;
      setRestoring(true);
      try {
        const p = await restoreBackupAsync(file, controller.signal);
        if (!controller.signal.aborted) {
          onRestore(p);
          onClose();
        }
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      } finally {
        if (restoreJob.current === controller) {
          restoreJob.current = null;
          setRestoring(false);
        }
      }
    });
  if (kind === "settings")
    return (
      <div className="settings-body">
        <div className="setting-row">
          <span>{t("界面语言", "Interface language")}</span>
          <button className="secondary-button" onClick={onLanguage}>
            {language === "zh" ? "English" : "简体中文"}
          </button>
        </div>
        <div className="setting-row">
          <span>{t("备份当前项目", "Back up this project")}</span>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              perform(async () => {
                await exportBackup(project);
                toast.success(
                  t(
                    "备份已准备好，请保存文件",
                    "Backup ready. Save the file below",
                  ),
                );
              })
            }
          >
            <Download size={14} />
            {t("导出备份", "Export backup")}
          </button>
        </div>
        <div className="setting-row">
          <span>{t("从备份恢复", "Restore a project")}</span>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => restoreInput.current?.click()}
          >
            <RotateCcw size={14} />
            {t("选择备份", "Choose backup")}
          </button>
        </div>
        <input
          hidden
          ref={restoreInput}
          type="file"
          accept=".json"
          onChange={(e) => restore(e.target.files?.[0])}
        />
        <div className="setting-note">
          <ShieldCheck size={19} />
          <p>
            {t(
              "资料与正文保存在当前浏览器。清理浏览器数据或更换网址前，请先导出备份。恢复会创建一个新项目。",
              "Your data stays in this browser. Back up before clearing browser data or moving to a different address. Restoring creates a new project.",
            )}
          </p>
        </div>
        <details className="backup-text-restore">
          <summary>{t("从备份文本恢复", "Restore from backup text")}</summary>
          <p className="small-copy">
            {t(
              "适用于下载受限时复制的小型项目备份。恢复会创建新项目。",
              "For small project backups copied when downloads are unavailable. Restoring creates a new project.",
            )}
          </p>
          <textarea
            aria-label={t("粘贴备份文本", "Paste backup text")}
            rows={4}
            maxLength={2 * 1024 * 1024}
            value={backupText}
            onChange={(e) => setBackupText(e.target.value)}
            placeholder={t(
              "在这里粘贴 Folio 备份文本…",
              "Paste your Folio backup text here…",
            )}
          />
          <button
            className="secondary-button"
            disabled={busy || !backupText.trim()}
            onClick={() =>
              restore(
                new File([backupText], "pasted.folio.json", {
                  type: "application/json",
                }),
              )
            }
          >
            {t("恢复此备份", "Restore this backup")}
          </button>
        </details>
        {restoring && (
          <div className="comparison-search-status" role="status">
            <Loader2 size={16} className="spin" />
            <span>{t("正在校验备份…", "Checking your backup…")}</span>
            <button
              className="text-action"
              onClick={() => restoreJob.current?.abort()}
            >
              {t("取消恢复", "Cancel restore")}
            </button>
          </div>
        )}
        <p className="small-copy">
          Folio 0.6.0 · {t("个人工作空间", "Personal workspace")}
        </p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  if (kind === "snapshot")
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSnapshot(name.trim() || t("手动保存", "Manual snapshot"));
          onClose();
        }}
      >
        <label className="field-label" htmlFor="snapshot-name">
          {t("给这个版本取个名字", "Name this version")}
        </label>
        <input
          id="snapshot-name"
          className="field-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("例如：完成初稿", "e.g. First draft complete")}
        />
        <p className="small-copy">
          {t(
            "保存当前正文和引用，之后可以恢复。",
            "Keep the current writing and citations for later recovery.",
          )}
        </p>
        <button className="primary-button dialog-submit">
          <Check size={15} />
          {t("保存版本", "Save version")}
        </button>
      </form>
    );
  return (
    <div className="import-dialog">
      {updateSourceId && (
        <p className="update-notice">
          {t("更新：", "Updating: ")}
          {project.sources.find((s) => s.id === updateSourceId)?.name}
          <br />
          {t(
            "旧版本和原有引用会保留。",
            "Earlier versions and citations will be preserved.",
          )}
        </p>
      )}
      <Tabs defaultValue="files">
        <TabsList className="import-tabs">
          <TabsTrigger value="files">{t("导入文件", "Files")}</TabsTrigger>
          <TabsTrigger value="paste">{t("粘贴文字", "Paste text")}</TabsTrigger>
        </TabsList>
        <TabsContent value="files">
          <button
            className={`drop-zone ${dragging ? "dragging" : ""}`}
            disabled={busy}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!busy) importFiles(e.dataTransfer.files);
            }}
          >
            {busy ? (
              <Loader2 className="spin" size={28} />
            ) : (
              <Upload size={28} strokeWidth={1.3} />
            )}
            <strong>
              {busy
                ? t("正在整理资料…", "Reading your sources…")
                : t("拖入文件，或点击选择", "Drop files here, or browse")}
            </strong>
            <span>PDF · TXT · Markdown</span>
            <small>
              {t(
                "每份最多 20 MB · 文本型 PDF",
                "Up to 20 MB each · Text-based PDFs",
              )}
            </small>
          </button>
          <input
            hidden
            ref={input}
            type="file"
            accept=".pdf,.txt,.md,.markdown"
            multiple={!updateSourceId}
            onChange={(e) => e.target.files && importFiles(e.target.files)}
          />
          <p className="small-copy">
            {t(
              "文件在本机读取。扫描件暂不支持文字识别。",
              "Files are read on your device. Scanned PDFs need OCR first.",
            )}
          </p>
        </TabsContent>
        <TabsContent value="paste">
          <label htmlFor="source-name" className="field-label">
            {t("资料名称", "Source name")}
          </label>
          <input
            id="source-name"
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("例如：用户访谈记录", "e.g. Interview notes")}
          />
          <label htmlFor="source-text" className="field-label">
            {t("资料内容", "Source text")}
          </label>
          <textarea
            id="source-text"
            className="field-input paste-content"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(
              "把值得留下的内容放在这里…",
              "Keep something worth coming back to…",
            )}
          />
          <button
            className="primary-button dialog-submit"
            disabled={busy || !name.trim() || !text.trim()}
            onClick={() =>
              perform(async () => {
                if (!updateSourceId && project.sources.length >= 20)
                  throw new Error(
                    t("每个项目最多 20 份资料", "Up to 20 sources per project"),
                  );
                const source = await sourceFromText(name.trim(), text);
                onImport([source], updateSourceId);
                onClose();
              })
            }
          >
            {busy ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <FileText size={15} />
            )}{" "}
            {t("保存资料", "Save source")}
            <ArrowUpRight size={15} />
          </button>
        </TabsContent>
      </Tabs>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
