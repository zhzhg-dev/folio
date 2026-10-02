"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Copy,
  Download,
  FileCheck2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { plainText, type Project, type Language } from "@/lib/folio/model";
import { notebookFor } from "@/lib/folio/notebook";
import {
  createDelivery,
  deliveryHtml,
  deliveryMarkdown,
  validDeliveries,
  deliveryLimits,
  type Delivery,
} from "@/lib/folio/delivery";
import { download } from "@/lib/folio/files";

export default function DeliveryView({
  project,
  language,
  onChange,
  onReview,
}: {
  project: Project;
  language: Language;
  onChange: (patch: Partial<Project>) => void;
  onReview: () => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const notebook = notebookFor(project);
  const [origin, setOrigin] = useState<Delivery["origin"]>(
    plainText(project.content).trim() ? "brief" : "findings",
  );
  const [title, setTitle] = useState(project.reportTitle);
  const [summary, setSummary] = useState("");
  const [selected, setSelected] = useState<string[]>(
    notebook.findings.map((f) => f.id),
  );
  const [notes, setNotes] = useState(false);
  const [preview, setPreview] = useState<Delivery | null>(null);
  const [error, setError] = useState("");
  const [copyText, setCopyText] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const surface = useRef<HTMLElement | null>(null);
  useEffect(() => {
    surface.current?.scrollTo({ top: 0 });
  }, [preview?.id]);
  const html = useMemo(() => (preview ? deliveryHtml(preview) : ""), [preview]);
  const saved = preview && project.deliveries?.some((d) => d.id === preview.id);
  const prepare = () => {
    try {
      setPreview(
        createDelivery(project, language, {
          origin,
          title,
          summary,
          findingIds: selected,
          includeNotes: notes,
        }),
      );
      setError("");
      setCopyText("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("无法创建预览", "Could not prepare preview"),
      );
    }
  };
  const save = () => {
    if (!preview || saved) return;
    const deliveries = [preview, ...(project.deliveries || [])];
    if (!validDeliveries(deliveries)) {
      setError(
        t(
          "每个项目最多保存 10 个交付版本、共 4 MB。请先删除不需要的交付版本。",
          "Keep up to 10 delivery editions, totaling 4 MB per project. Remove an unneeded edition first.",
        ),
      );
      return;
    }
    onChange({ deliveries });
    setError("");
    toast.success(
      t("交付版本已保存到此设备", "Delivery edition saved on this device"),
    );
  };
  const copy = async () => {
    if (!preview) return;
    const text = deliveryMarkdown(preview);
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("已复制交付文本", "Delivery text copied"));
    } catch {
      setCopyText(text);
    }
  };
  return (
    <section ref={surface} className="collection-page delivery-page">
      <div className="collection-header">
        <div>
          <span className="overline">
            {t(
              "让研究成为可交付的成果",
              "GOOD RESEARCH, READY TO LEAVE YOUR DESK",
            )}
          </span>
          <h1>{t("交付", "Delivery")}</h1>
          <p>
            {t(
              "把选定内容和引用摘录整理为固定版本。收件人无需账号即可打开 HTML 文件。",
              "Prepare a fixed edition with the passages behind it. Recipients can open the HTML file without an account.",
            )}
          </p>
        </div>
        <button className="secondary-button" onClick={onReview}>
          {t("研究复核", "Research review")}
          <ArrowUpRight size={14} />
        </button>
      </div>
      {error && (
        <p className="delivery-error" role="alert">
          {error}
        </p>
      )}
      {preview ? (
        <>
          <div className="delivery-preview-bar">
            <button
              className="secondary-button"
              onClick={() => {
                setPreview(null);
                setCopyText("");
                setError("");
              }}
            >
              <ArrowLeft size={14} />
              {t("返回准备", "Back to preparation")}
            </button>
            <span>
              {saved
                ? t("已保存的固定版本", "Saved fixed edition")
                : t("预览 · 尚未保存", "Preview · not saved")}
            </span>
            <div>
              {!saved && (
                <button className="primary-button" onClick={save}>
                  <FileCheck2 size={15} />
                  {t("保存此版本", "Save this edition")}
                </button>
              )}
              <button
                className="secondary-button"
                onClick={() =>
                  download(
                    new Blob([html], { type: "text/html;charset=utf-8" }),
                    `${preview.title.replace(/[<>:"/\\|?*]/g, "-") || "Folio"}.html`,
                  )
                }
              >
                <Download size={15} />
                {t("导出 HTML", "Export HTML")}
              </button>
              <button className="secondary-button" onClick={copy}>
                <Copy size={14} />
                {t("复制文本", "Copy text")}
              </button>
            </div>
          </div>
          <p className="delivery-caption">
            {t(
              "下方即为收件人看到的内容。保存或导出后不会跟随研究更新；导出的文件无法远程撤回。",
              "The preview shows what recipients will see. Saved or exported editions do not update with your research. Exported files cannot be remotely revoked.",
            )}
          </p>
          {copyText && (
            <label className="delivery-copy">
              {t("可手动复制下面的交付文本", "Copy the delivery text below")}
              <textarea
                readOnly
                value={copyText}
                onFocus={(e) => e.target.select()}
              />
            </label>
          )}
          <iframe
            className="delivery-preview"
            title={t("只读交付预览", "Read-only delivery preview")}
            sandbox=""
            srcDoc={html}
          />
        </>
      ) : (
        <div className="delivery-layout">
          <div className="delivery-prepare">
            <h2>{t("准备新版本", "Prepare an edition")}</h2>
            <label>
              {t("内容来源", "Content")}
              <select
                value={origin}
                onChange={(e) =>
                  setOrigin(e.target.value as Delivery["origin"])
                }
              >
                <option value="brief">{t("当前简报", "Current brief")}</option>
                <option value="findings">
                  {t("选定研究发现", "Selected findings")}
                </option>
              </select>
            </label>
            <label>
              {t("交付标题", "Delivery title")}
              <input
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              {t("给读者的说明（选填）", "A note to your reader (optional)")}
              <textarea
                value={summary}
                maxLength={2000}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                placeholder={t(
                  "本次研究解决了什么，仍有哪些限制？",
                  "What does this research answer? What remains open?",
                )}
              />
            </label>
            {origin === "findings" ? (
              <>
                <div className="delivery-selection-title">
                  <strong>
                    {t("选择发现", "Choose findings")} · {selected.length}
                  </strong>
                  <button
                    onClick={() =>
                      setSelected(
                        selected.length === notebook.findings.length
                          ? []
                          : notebook.findings.map((f) => f.id),
                      )
                    }
                  >
                    {selected.length === notebook.findings.length
                      ? t("取消全选", "Clear selection")
                      : t("全选", "Select all")}
                  </button>
                </div>
                <div className="delivery-findings">
                  {notebook.questions.map((q) => (
                    <fieldset key={q.id}>
                      <legend>{q.title}</legend>
                      {notebook.findings
                        .filter((f) => f.questionId === q.id)
                        .map((f) => (
                          <label key={f.id}>
                            <input
                              type="checkbox"
                              checked={selected.includes(f.id)}
                              onChange={(e) =>
                                setSelected(
                                  e.target.checked
                                    ? [...selected, f.id]
                                    : selected.filter((id) => id !== f.id),
                                )
                              }
                            />
                            <span>
                              {f.value || t("空白发现", "Empty finding")}
                            </span>
                          </label>
                        ))}
                    </fieldset>
                  ))}
                  {!notebook.findings.length && (
                    <p>
                      {t("请先添加研究发现。", "Add research findings first.")}
                    </p>
                  )}
                </div>
                <label className="delivery-notes">
                  <input
                    type="checkbox"
                    checked={notes}
                    onChange={(e) => setNotes(e.target.checked)}
                  />
                  {t(
                    "附上选定发现中的个人备注",
                    "Include personal notes on selected findings",
                  )}
                </label>
              </>
            ) : (
              <p className="delivery-caption">
                {t(
                  "包含简报中的全部正文。请在预览中检查是否有私人信息。",
                  "Includes all authored text in the brief. Check the preview for private information.",
                )}
              </p>
            )}
            <div className="delivery-inclusion">
              <FileCheck2 size={19} />
              <p>
                {t(
                  "包含选定正文、引用原文摘录和创建时的来源状态。不会附加资料全文、原文件、问答历史或账号信息。",
                  "Includes selected content, cited passages and source status at preparation. Source files, full source texts, conversation history and account details are excluded.",
                )}
              </p>
            </div>
            <button
              className="primary-button"
              disabled={
                !title.trim() || (origin === "findings" && !selected.length)
              }
              onClick={prepare}
            >
              {t("检查并预览", "Check & preview")}
              <ArrowUpRight size={15} />
            </button>
            <p className="delivery-caption">
              {t(
                "预览草稿不会自动保存。",
                "Preview drafts are not saved automatically.",
              )}
            </p>
          </div>
          <aside className="delivery-editions">
            <span className="overline">{t("留存与交付", "YOUR EDITIONS")}</span>
            <h2>
              {t("已保存版本", "Saved editions")}
              <span>
                {project.deliveries?.length || 0}/{deliveryLimits.count}
              </span>
            </h2>
            {project.deliveries?.length ? (
              project.deliveries.map((d) => (
                <article className="delivery-edition" key={d.id}>
                  <button
                    className="delivery-edition-open"
                    onClick={() => {
                      setPreview(d);
                      setError("");
                    }}
                  >
                    <FileCheck2 size={18} />
                    <span>
                      <strong>{d.title}</strong>
                      <small>
                        {new Date(d.createdAt).toLocaleDateString(
                          language === "zh" ? "zh-CN" : "en",
                          { year: "numeric", month: "short", day: "numeric" },
                        )}{" "}
                        · {d.references.length} {t("条引用", "citations")}
                      </small>
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                  {deleting === d.id ? (
                    <div className="delivery-delete">
                      <span>
                        {t(
                          "删除此保存版本？已有导出文件不受影响。",
                          "Remove this saved edition? Exported files remain.",
                        )}
                      </span>
                      <button
                        onClick={() => {
                          onChange({
                            deliveries: project.deliveries!.filter(
                              (x) => x.id !== d.id,
                            ),
                          });
                          setDeleting(null);
                        }}
                      >
                        {t("删除", "Remove")}
                      </button>
                      <button onClick={() => setDeleting(null)}>
                        {t("取消", "Cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="delivery-remove"
                      aria-label={
                        t("删除交付版本：", "Remove edition: ") + d.title
                      }
                      onClick={() => setDeleting(d.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </article>
              ))
            ) : (
              <div className="delivery-editions-empty">
                <FileCheck2 size={28} />
                <p>
                  {t(
                    "研究会继续，交付版本留在这一刻。",
                    "Your research keeps moving. An edition preserves this moment.",
                  )}
                </p>
              </div>
            )}
            <p className="delivery-caption">
              {t(
                "版本保存在此设备，包含在项目备份中。最多 10 份，共 4 MB。",
                "Editions are stored on this device and included in project backups. Up to 10 editions, totaling 4 MB.",
              )}
            </p>
          </aside>
        </div>
      )}
    </section>
  );
}
