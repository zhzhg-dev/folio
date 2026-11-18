"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Link2,
  RefreshCw,
  Unlink,
} from "lucide-react";
import type { JSONContent } from "@tiptap/react";
import { plainText, type Language, type Project } from "@/lib/folio/model";
import {
  linkedBriefItems,
  unlinkBriefBlock,
  updateLinkedBrief,
  type LinkedBriefItem,
} from "@/lib/folio/linked-brief";

export type BriefLinksProps = {
  project: Project;
  language: Language;
  onContent: (content: JSONContent, snapshotTitle: string) => void;
  onOpenFinding?: (id: string) => void;
  onOpenComparison?: () => void;
  initialBlock?: string;
};
const sectionText = (node: JSONContent) =>
  (node.content || []).map(plainText).join("\n\n");

export default function BriefLinks({
  project,
  language,
  onContent,
  onOpenFinding,
  onOpenComparison,
  initialBlock,
}: BriefLinksProps) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const items = useMemo(() => linkedBriefItems(project), [project]);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<LinkedBriefItem | null>(null);
  const [replaceEdited, setReplaceEdited] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const initial = initialBlock
      ? items.find((item) => item.id === initialBlock)
      : undefined;
    setOpen(!!initial);
    setPreview(initial || null);
    setReplaceEdited(false);
    setError("");
  }, [project.id, initialBlock]);
  const pending = items.filter((item) => item.status !== "current").length;
  if (!items.length) return null;
  const labels = {
    current: t("与原结论一致", "Up to date"),
    updated: t("有结论更新", "Conclusion updated"),
    archived: t("原发现已归档", "Finding archived"),
    missing: t("原结论或证据不可用", "Conclusion or evidence unavailable"),
  };
  const act = (target: LinkedBriefItem, unlink: boolean) => {
    try {
      const content = unlink
        ? unlinkBriefBlock(project.content, target)
        : updateLinkedBrief(project, target, { replaceEdited });
      onContent(
        content,
        unlink
          ? t("解除简报关联之前", "Before making a brief section independent")
          : t("更新关联简报之前", "Before updating a linked brief section"),
      );
      setPreview(null);
      setReplaceEdited(false);
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t("更新失败，请重试", "Could not update. Try again."),
      );
    }
  };
  return (
    <section
      className={`brief-links ${pending ? "has-updates" : ""}`}
      aria-label={t("简报关联", "Brief connections")}
    >
      <button
        className="brief-links-summary"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setError("");
        }}
      >
        <Link2 size={15} aria-hidden="true" />
        <span>
          {pending
            ? t(
                `${pending} 处关联需要检查`,
                `${pending} linked ${pending === 1 ? "section needs" : "sections need"} attention`,
              )
            : t(
                `${items.length} 处关联随时可追溯`,
                `${items.length} linked ${items.length === 1 ? "section" : "sections"}`,
              )}
        </span>
        <span className="brief-links-summary-note">
          {t("修改由你确认", "You control updates")}
        </span>
        <ChevronDown
          size={14}
          className={open ? "is-open" : ""}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="brief-links-body">
          <p className="brief-links-explanation">
            {t(
              "结论变化不会改写正文。查看差异，再决定是否更新；每次操作都会保留原稿。",
              "Changes to your research never rewrite this brief. Review each update; your previous draft is kept in history.",
            )}
          </p>
          <ul className="brief-links-list">
            {items.map((item) => (
              <li
                key={`${item.id}:${item.path.join(".")}`}
                className="brief-links-row"
              >
                <div className="brief-links-row-copy">
                  <span className="brief-links-origin">
                    {item.origin === "comparison"
                      ? t("比较表", "Comparison")
                      : t("研究发现", "Finding")}
                  </span>
                  <p>{item.title}</p>
                  <span className={`brief-links-status is-${item.status}`}>
                    {labels[item.status]}
                    {item.edited
                      ? t(" · 正文有你的修改", " · Your writing has edits")
                      : ""}
                  </span>
                </div>
                <div className="brief-links-row-actions">
                  <button
                    className="text-action"
                    onClick={() => {
                      setPreview(item);
                      setReplaceEdited(false);
                      setError("");
                    }}
                  >
                    {t("查看关联", "Review section")}
                  </button>
                  {(item.origin === "comparison"
                    ? onOpenComparison
                    : onOpenFinding) && (
                    <button
                      className="icon-button"
                      aria-label={
                        item.origin === "comparison"
                          ? t("打开比较表", "Open comparison")
                          : t("打开原发现", "Open finding")
                      }
                      onClick={() =>
                        item.origin === "comparison"
                          ? onOpenComparison?.()
                          : onOpenFinding?.(item.findingId!)
                      }
                    >
                      <ArrowUpRight size={15} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {preview && (
            <section
              className="linked-brief-preview"
              aria-label={t("更新预览", "Update preview")}
            >
              <div className="linked-brief-preview-heading">
                <strong>{t("检查这处关联", "Review this connection")}</strong>
                <button
                  className="text-action"
                  onClick={() => {
                    setPreview(null);
                    setError("");
                  }}
                >
                  {t("关闭", "Close")}
                </button>
              </div>
              <div className="linked-brief-diff">
                <div>
                  <h3>{t("当前简报", "In your brief")}</h3>
                  <pre>{sectionText(preview.block)}</pre>
                </div>
                <div>
                  <h3>{t("最新结论", "Latest research")}</h3>
                  {preview.candidate ? (
                    <pre>{sectionText(preview.candidate)}</pre>
                  ) : (
                    <p>
                      {preview.error ||
                        (preview.status === "archived"
                          ? t(
                              "先恢复原发现，才能更新。你仍可以保留当前正文并解除关联。",
                              "Restore the finding before updating. You can keep this writing as an independent section.",
                            )
                          : t(
                              "原结论已不可用，当前正文仍被保留。",
                              "The original conclusion is unavailable. Your current writing is preserved.",
                            ))}
                    </p>
                  )}
                </div>
              </div>
              {preview.edited && preview.candidate && (
                <label className="linked-brief-confirm">
                  <input
                    type="checkbox"
                    checked={replaceEdited}
                    onChange={(event) => setReplaceEdited(event.target.checked)}
                  />
                  <span>
                    {t(
                      "用最新结论替换我在此段落的修改；原稿保留在历史中",
                      "Replace my edits in this section with the latest research; keep the previous draft in history",
                    )}
                  </span>
                </label>
              )}
              <div className="linked-brief-preview-actions">
                <button
                  className="secondary-button"
                  onClick={() => act(preview, true)}
                >
                  <Unlink size={14} />
                  {t("保留正文，解除关联", "Keep writing independent")}
                </button>
                <button
                  className="primary-button"
                  disabled={
                    !preview.candidate || (preview.edited && !replaceEdited)
                  }
                  onClick={() => act(preview, false)}
                >
                  <RefreshCw size={14} />
                  {t("应用到此段落", "Apply to this section")}
                </button>
              </div>
            </section>
          )}
          {error && (
            <p className="brief-links-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
