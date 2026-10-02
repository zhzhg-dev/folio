import { useState } from "react";
import { Archive, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import type {
  Project,
  Notebook,
  Language,
  NotebookArchiveItem,
} from "@/lib/folio/model";
import { notebookFor } from "@/lib/folio/notebook";
import {
  archiveFinding,
  archiveQuestion,
  moveFinding,
  reorderFinding,
  reorderQuestion,
  restoreNotebookItem,
} from "@/lib/folio/notebook-actions";

export default function NotebookOrganizer({
  project,
  language,
  onChange,
  onOpen,
}: {
  project: Project;
  language: Language;
  onChange: (n: Notebook) => void;
  onOpen: (questionId: string, findingId?: string) => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const notebook = notebookFor(project);
  const [tab, setTab] = useState<"active" | "archived">("active"),
    [expanded, setExpanded] = useState("");
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const apply = (action: () => Notebook, message: string) => {
    try {
      onChange(action());
      setDestinations({});
      setMessage(message);
      setConfirm("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not update research");
    }
  };
  const restored = t(
    "已恢复，请重新核对。",
    "Restored. Review the finding again before using it.",
  );
  const restore = (entry: NotebookArchiveItem) =>
    apply(
      () =>
        restoreNotebookItem(
          notebook,
          entry.id,
          destinations[entry.id] ||
            (notebook.questions.some((q) => q.id === entry.question.id)
              ? entry.question.id
              : notebook.questions[0]?.id),
        ),
      restored,
    );
  return (
    <div className="organizer">
      <p className="capture-hint">
        {t(
          "整理问题与发现。归档可恢复，简报和已保存的交付版本保持原样。移动或恢复后需重新核对。",
          "Give each finding a place. Archives can be restored; briefs and saved deliveries stay as written. Moved or restored findings need a fresh review.",
        )}
      </p>
      <div
        className="organizer-tabs"
        role="group"
        aria-label={t("研究状态", "Research state")}
      >
        <button
          aria-pressed={tab === "active"}
          onClick={() => setTab("active")}
        >
          {t("研究中", "Active")} <span>{notebook.questions.length}</span>
        </button>
        <button
          aria-pressed={tab === "archived"}
          onClick={() => setTab("archived")}
        >
          {t("已归档", "Archived")}{" "}
          <span>{notebook.archived?.length || 0}</span>
        </button>
      </div>
      <div role="status" className="organizer-status">
        {message ||
          t(
            `${notebook.questions.length}/30 个问题 · ${notebook.findings.length}/200 条发现`,
            `${notebook.questions.length}/30 questions · ${notebook.findings.length}/200 findings`,
          )}
      </div>
      {tab === "active" ? (
        <div className="organizer-list">
          {!notebook.questions.length && (
            <p>
              {t(
                "暂无活跃问题。你可以从归档中恢复研究。",
                "No active questions. You can restore research from the archive.",
              )}
            </p>
          )}
          {notebook.questions.map((q, qi) => {
            const findings = notebook.findings.filter(
              (f) => f.questionId === q.id,
            );
            return (
              <section className="organizer-question" key={q.id}>
                <div className="organizer-question-heading">
                  <button
                    className="organizer-title"
                    aria-expanded={expanded === q.id}
                    onClick={() => setExpanded(expanded === q.id ? "" : q.id)}
                  >
                    <span>{String(qi + 1).padStart(2, "0")}</span>
                    <strong>{q.title}</strong>
                    <small>{findings.length}</small>
                    <ChevronDown size={16} />
                  </button>
                  <div className="organizer-row-actions">
                    <button
                      className="icon-button"
                      aria-label={t("上移问题", "Move question up")}
                      disabled={qi === 0}
                      onClick={() =>
                        apply(
                          () => reorderQuestion(notebook, q.id, -1),
                          t("顺序已更新", "Order updated"),
                        )
                      }
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={t("下移问题", "Move question down")}
                      disabled={qi === notebook.questions.length - 1}
                      onClick={() =>
                        apply(
                          () => reorderQuestion(notebook, q.id, 1),
                          t("顺序已更新", "Order updated"),
                        )
                      }
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button className="quiet-link" onClick={() => onOpen(q.id)}>
                      {t("打开", "Open")}
                    </button>
                    <button
                      className="quiet-link"
                      onClick={() => setConfirm(q.id)}
                    >
                      <Archive size={14} />
                      {t("归档", "Archive")}
                    </button>
                  </div>
                </div>
                {confirm === q.id && (
                  <div className="organizer-confirm">
                    <p>
                      {t(
                        `归档此问题及其 ${findings.length} 条发现？可从“已归档”恢复。`,
                        `Archive this question and its ${findings.length} findings? You can restore them from Archived.`,
                      )}
                    </p>
                    <button
                      className="secondary-button"
                      onClick={() =>
                        apply(
                          () => archiveQuestion(notebook, q.id),
                          t(
                            "问题及其发现已归档",
                            "Question and findings archived",
                          ),
                        )
                      }
                    >
                      {t("确认归档", "Archive question")}
                    </button>
                    <button
                      className="quiet-link"
                      onClick={() => setConfirm("")}
                    >
                      {t("取消", "Cancel")}
                    </button>
                  </div>
                )}
                {expanded === q.id && (
                  <div className="organizer-findings">
                    {!findings.length && (
                      <p className="capture-hint">
                        {t(
                          "此问题下还没有发现。",
                          "No findings under this question yet.",
                        )}
                      </p>
                    )}
                    {findings.map((f, fi) => (
                      <div className="organizer-finding" key={f.id}>
                        <button
                          className="organizer-finding-title"
                          onClick={() => onOpen(q.id, f.id)}
                        >
                          {f.value}
                        </button>
                        <div className="organizer-row-actions">
                          <button
                            className="icon-button"
                            aria-label={t("上移发现", "Move finding up")}
                            disabled={fi === 0}
                            onClick={() =>
                              apply(
                                () => reorderFinding(notebook, f.id, -1),
                                t("順序已更新", "Order updated"),
                              )
                            }
                          >
                            <ChevronUp size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={t("下移发现", "Move finding down")}
                            disabled={fi === findings.length - 1}
                            onClick={() =>
                              apply(
                                () => reorderFinding(notebook, f.id, 1),
                                t("顺序已更新", "Order updated"),
                              )
                            }
                          >
                            <ChevronDown size={15} />
                          </button>
                          <select
                            aria-label={t("移动到问题", "Move to question")}
                            value={destinations[f.id] || ""}
                            onChange={(e) =>
                              setDestinations((v) => ({
                                ...v,
                                [f.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">{t("移动到…", "Move to…")}</option>
                            {notebook.questions
                              .filter((other) => other.id !== q.id)
                              .map((other) => (
                                <option key={other.id} value={other.id}>
                                  {other.title}
                                </option>
                              ))}
                          </select>
                          <button
                            className="quiet-link"
                            disabled={!destinations[f.id]}
                            onClick={() =>
                              apply(
                                () =>
                                  moveFinding(
                                    notebook,
                                    f.id,
                                    destinations[f.id],
                                  ),
                                t(
                                  "已移动，请重新核对",
                                  "Moved. A fresh review is needed.",
                                ),
                              )
                            }
                          >
                            {t("移动", "Move")}
                          </button>
                          <button
                            className="quiet-link"
                            onClick={() =>
                              apply(
                                () => archiveFinding(notebook, f.id),
                                t("发现已归档", "Finding archived"),
                              )
                            }
                          >
                            <Archive size={14} />
                            {t("归档", "Archive")}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="organizer-list">
          {!notebook.archived?.length && (
            <div className="organizer-empty">
              <Archive size={24} />
              <p>
                {t("归档是留白，不是删除。", "Room for what matters next.")}
              </p>
              <small>
                {t(
                  "暂时不用的问题与发现会保留在这里。",
                  "Questions and findings you set aside will be kept here.",
                )}
              </small>
            </div>
          )}
          {notebook.archived?.map((entry) => (
            <section className="organizer-archived" key={entry.id}>
              <div>
                <small>
                  {entry.kind === "question"
                    ? t("问题", "Question")
                    : t("发现", "Finding")}{" "}
                  ·{" "}
                  {new Date(entry.archivedAt).toLocaleDateString(
                    language === "zh" ? "zh-CN" : "en-US",
                  )}
                </small>
                <h3>
                  {entry.kind === "question"
                    ? entry.question.title
                    : entry.findings[0].value}
                </h3>
                <p>
                  {entry.kind === "question"
                    ? t(
                        `${entry.findings.length} 条发现 · 包含原始出处与备注`,
                        `${entry.findings.length} findings · Original evidence and notes kept`,
                      )
                    : entry.question.title}
                </p>
              </div>
              <div className="organizer-row-actions">
                {entry.kind === "finding" && (
                  <select
                    aria-label={t("恢复到问题", "Restore to question")}
                    value={
                      destinations[entry.id] ||
                      (notebook.questions.some(
                        (q) => q.id === entry.question.id,
                      )
                        ? entry.question.id
                        : notebook.questions[0]?.id || "")
                    }
                    onChange={(e) =>
                      setDestinations((v) => ({
                        ...v,
                        [entry.id]: e.target.value,
                      }))
                    }
                  >
                    {!notebook.questions.length && (
                      <option value="">
                        {t("请先恢复一个问题", "Restore a question first")}
                      </option>
                    )}
                    {notebook.questions.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.title}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="secondary-button"
                  disabled={
                    entry.kind === "finding" && !notebook.questions.length
                  }
                  onClick={() => restore(entry)}
                >
                  <RotateCcw size={14} />
                  {t("恢复", "Restore")}
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
