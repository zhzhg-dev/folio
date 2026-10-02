import { useState, useEffect, useRef } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Bookmark,
  ChevronDown,
  FileText,
  Pencil,
  Check,
  Circle,
  Search,
  Leaf,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { CellEditor } from "./comparison-view";
import {
  uid,
  type Project,
  type Language,
  type Notebook,
  type Finding,
  type Evidence,
} from "@/lib/folio/model";
import {
  notebookFor,
  findingStatus,
  editFinding,
  notebookLimits,
} from "@/lib/folio/notebook";
import { evidenceExists } from "@/lib/folio/research";

type Props = {
  project: Project;
  language: Language;
  questionId: string;
  onChange: (notebook: Notebook) => void;
  onStart: (objective: string) => void;
  onImport: () => void;
  onExample: () => void;
  onEvidence: (evidence: Evidence) => void;
  onAdd: (finding: Finding) => void;
  onBrief: () => void;
  onAsk: (question: string) => void;
  onOrganize: () => void;
  focusFinding?: { id: string; nonce: number } | null;
};
export default function ResearchNotebook({
  project,
  language,
  questionId,
  onChange,
  onStart,
  onImport,
  onExample,
  onEvidence,
  onAdd,
  onBrief,
  onAsk,
  onOrganize,
  focusFinding,
}: Props) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const notebook = notebookFor(project);
  const question =
    notebook.questions.find((q) => q.id === questionId) ||
    notebook.questions[0];
  const findings = notebook.findings.filter(
    (f) => f.questionId === question?.id,
  );
  const [objective, setObjective] = useState(notebook.objective);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Finding | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [questionTitle, setQuestionTitle] = useState("");
  const focused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setExpanded(null);
    setEditing(null);
    setRenaming(false);
  }, [question?.id]);
  useEffect(() => {
    if (focusFinding && findings.some((f) => f.id === focusFinding.id)) {
      setExpanded(focusFinding.id);
      focused.current?.scrollIntoView({ block: "center" });
      focused.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true });
    }
  }, [focusFinding, question?.id]);
  const active = expanded === null ? findings[0]?.id : expanded;
  const update = (finding: Finding) =>
    onChange({
      ...notebook,
      findings: notebook.findings.map((f) =>
        f.id === finding.id ? finding : f,
      ),
    });
  const labels = {
    reviewed: t("已核对", "Reviewed"),
    unreviewed: t("未核对", "Not reviewed"),
    changed: t("来源已更新", "Source updated"),
    missing: t("待补充证据", "Needs evidence"),
  };
  if (!notebook.questions.length)
    return (
      <section className="research-welcome">
        {!!notebook.archived?.length && (
          <button className="quiet-link" onClick={onOrganize}>
            {t("查看归档研究", "View archived research")}
          </button>
        )}
        <div className="welcome-symbol">
          <Leaf size={25} strokeWidth={1.4} />
        </div>
        <span className="notebook-eyebrow">
          {t("从一个值得研究的问题开始", "A little clarity starts here")}
        </span>
        <h1>{t("你想弄清楚什么？", "What would you like to understand?")}</h1>
        <p>
          {t(
            "把资料、发现和自己的判断放在一起，写成一份有据可查的简报。",
            "Bring your sources, findings and judgment together. Leave with a brief you can stand behind.",
          )}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (objective.trim()) onStart(objective.trim());
          }}
        >
          <label htmlFor="research-objective">
            {t("研究目标", "Your research objective")}
          </label>
          <textarea
            id="research-objective"
            rows={3}
            maxLength={200}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder={t(
              "例如：哪款客服软件适合我们五人的团队？",
              "e.g. Which support tool fits our team of five?",
            )}
          />
          <div className="welcome-suggestions">
            {(language === "zh"
              ? [
                  "为团队选择合适的软件",
                  "梳理一篇论文的关键论点",
                  "比较一个决定的利弊",
                ]
              : [
                  "Choose software for my team",
                  "Understand a paper’s key claims",
                  "Weigh the trade-offs of a decision",
                ]
            ).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setObjective(value)}
              >
                {value}
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
          <button className="primary-button" disabled={!objective.trim()}>
            {t("开始研究", "Start research")}
            <ArrowRight size={16} />
          </button>
        </form>
        <div className="welcome-path">
          <span>01 {t("提出问题", "Set a question")}</span>
          <i />
          <span>02 {t("加入资料", "Bring sources")}</span>
          <i />
          <span>03 {t("形成简报", "Build a brief")}</span>
        </div>
        <button className="quiet-link" onClick={onExample}>
          {t("先看看示例如何运作", "See how a sample works")}
          <ArrowUpRight size={14} />
        </button>
        <small>
          {t(
            "资料保存在此浏览器。请定期导出备份。",
            "Stored in this browser. Export a backup to keep a copy.",
          )}
        </small>
      </section>
    );
  return (
    <section className="notebook-page">
      <header className="notebook-heading">
        <div className="notebook-eyebrow">
          {t("问题", "Question")}{" "}
          {String(notebook.questions.indexOf(question) + 1).padStart(2, "0")}
          <span className="folio-bookmark" />
        </div>
        {renaming ? (
          <form
            className="rename-question"
            onSubmit={(e) => {
              e.preventDefault();
              if (!questionTitle.trim()) return;
              onChange({
                ...notebook,
                questions: notebook.questions.map((q) =>
                  q.id === question.id
                    ? { ...q, title: questionTitle.trim() }
                    : q,
                ),
                findings: notebook.findings.map((f) =>
                  f.questionId === question.id
                    ? { ...f, reviewedAt: undefined }
                    : f,
                ),
              });
              setRenaming(false);
            }}
          >
            <input
              autoFocus
              aria-label={t("问题名称", "Question title")}
              maxLength={200}
              value={questionTitle}
              onChange={(e) => setQuestionTitle(e.target.value)}
            />
            <button className="secondary-button">{t("保存", "Save")}</button>
            <button
              type="button"
              className="quiet-link"
              onClick={() => setRenaming(false)}
            >
              {t("取消", "Cancel")}
            </button>
          </form>
        ) : (
          <div className="question-title-row">
            <h1>{question.title}</h1>
            <button
              className="icon-button"
              aria-label={t("编辑问题", "Edit question")}
              onClick={() => {
                setQuestionTitle(question.title);
                setRenaming(true);
              }}
            >
              <Pencil size={15} />
            </button>
          </div>
        )}
        {notebook.objective !== question.title && (
          <p className="notebook-context">{notebook.objective}</p>
        )}
        <div className="notebook-counts">
          <button className="quiet-link notebook-organize" onClick={onOrganize}>
            {t("整理研究", "Organize research")}
          </button>
          <span>
            {findings.length}{" "}
            {t("条发现", findings.length === 1 ? "finding" : "findings")}
          </span>
          <span>
            {findings.filter((f) => f.evidence.length).length}{" "}
            {t("条附有来源", "with sources")}
          </span>
          {findings.some((f) => findingStatus(f, project) === "changed") && (
            <span className="needs-attention">
              {t("有来源更新，请复核", "Source updates need review")}
            </span>
          )}
        </div>
        {project.example && (
          <p className="sample-disclosure">
            {t(
              "虚构示例 · 仅用于演示工作流程，不代表真实产品或研究。",
              "Fictional sample · Created to demonstrate the workflow, not real products or research.",
            )}
          </p>
        )}
      </header>
      {!findings.length && (
        <div className="notebook-empty">
          <span className="empty-finding-mark">F01</span>
          <h2>
            {project.sources.length
              ? t(
                  "从资料中找出第一条发现",
                  "Find the first piece of your answer",
                )
              : t(
                  "先给这个问题一些依据",
                  "Give your question something to work with",
                )}
          </h2>
          <p>
            {project.sources.length
              ? t(
                  "查找相关原文，核对后保留有用的发现。你也可以直接写下自己的判断。",
                  "Find a relevant passage, check it, and keep what matters. You can also record a judgment of your own.",
                )
              : t(
                  "添加 PDF、笔记或粘贴一段文字。每条发现都可以保留原文出处。",
                  "Add a PDF, your notes, or a passage of text. Keep each finding connected to its original source.",
                )}
          </p>
          <button
            className="primary-button"
            onClick={() =>
              project.sources.length ? onAsk(question.title) : onImport()
            }
          >
            {project.sources.length ? <Search size={16} /> : <Plus size={16} />}
            {project.sources.length
              ? t("查找相关原文", "Find relevant passages")
              : t("添加资料", "Add sources")}
          </button>
        </div>
      )}
      <div className="findings-list">
        {findings.map((finding, index) => {
          const open = active === finding.id;
          const status = findingStatus(finding, project);
          const sourceCount = new Set(finding.evidence.map((e) => e.sourceId))
            .size;
          const valid = finding.evidence.every((e) =>
            evidenceExists(e, project),
          );
          return (
            <article
              className={`finding-row ${open ? "is-open" : ""}`}
              key={finding.id}
              data-finding-id={finding.id}
              ref={(node) => {
                if (focusFinding?.id === finding.id) focused.current = node;
              }}
            >
              <button
                className="finding-summary"
                aria-expanded={open}
                aria-controls={`finding-${index}`}
                onClick={() => setExpanded(open ? "" : finding.id)}
              >
                <span className="finding-index">
                  F{String(index + 1).padStart(2, "0")}
                </span>
                <span className="finding-summary-copy">
                  <strong>{finding.value}</strong>
                  {!open && finding.note && <span>{finding.note}</span>}
                </span>
                <span className="finding-meta">
                  {sourceCount > 0 && (
                    <span>
                      {sourceCount}{" "}
                      {t("份来源", sourceCount === 1 ? "source" : "sources")}
                    </span>
                  )}
                  <span className={`finding-status ${status}`}>
                    {status === "reviewed" ? (
                      <Check size={13} />
                    ) : status === "changed" || status === "missing" ? (
                      <Circle size={13} />
                    ) : null}
                    {labels[status]}
                  </span>
                </span>
                <ChevronDown size={16} />
              </button>
              {open && (
                <div className="finding-detail" id={`finding-${index}`}>
                  <div className="evidence-surface">
                    {finding.evidence.map((e, i) => {
                      const source = project.sources.find(
                        (s) => s.id === e.sourceId,
                      );
                      const versionIndex =
                        source?.versions.findIndex(
                          (v) => v.id === e.versionId,
                        ) ?? -1;
                      const version = source?.versions[versionIndex];
                      return (
                        <div className="notebook-evidence" key={e.id}>
                          <div className="evidence-caption">
                            <FileText size={19} />
                            <div>
                              <strong>
                                {t("来源", "Source")}{" "}
                                {String(i + 1).padStart(2, "0")}
                                <span>·</span>
                                {source?.name || e.name}
                              </strong>
                              <small>
                                {t("第 ", "Page ")}
                                {e.page} · v{versionIndex + 1}
                                {version && (
                                  <>
                                    {" "}
                                    · {t("保存于 ", "Saved ")}
                                    {new Date(
                                      version.createdAt,
                                    ).toLocaleDateString(
                                      language === "zh" ? "zh-CN" : "en-GB",
                                      { day: "numeric", month: "short" },
                                    )}
                                  </>
                                )}
                              </small>
                            </div>
                          </div>
                          <blockquote>“{e.quote}”</blockquote>
                          <button
                            className="source-link"
                            disabled={!version}
                            onClick={() => onEvidence(e)}
                          >
                            {t("查看原文", "Open source")} · p.{e.page}
                            <ArrowUpRight size={14} />
                          </button>
                          {source?.versions.at(-1)?.id !== e.versionId && (
                            <p className="needs-attention">
                              {t(
                                "资料有新版本；此处保留原来的证据。编辑发现以重新核对。",
                                "A newer revision is available. This keeps the original evidence; edit the finding to recheck it.",
                              )}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {!finding.evidence.length && (
                      <div className="evidence-gap">
                        <Circle size={17} />
                        <p>
                          {t(
                            "还没有关联原文。添加证据，或将其保留为待确认的判断。",
                            "No source attached yet. Add evidence, or keep this as an open judgment.",
                          )}
                        </p>
                        <button
                          className="quiet-link"
                          onClick={() => setEditing(finding)}
                        >
                          {t("关联证据", "Attach evidence")}
                          <Plus size={14} />
                        </button>
                      </div>
                    )}
                    <label className="finding-note">
                      <span>
                        <Pencil size={16} />
                        {t("我的备注", "Your note")}
                      </span>
                      <textarea
                        aria-label={t("我的备注", "Your note")}
                        rows={2}
                        maxLength={10000}
                        value={finding.note}
                        placeholder={t(
                          "记录你的判断、适用条件或下一步…",
                          "Your interpretation, a condition to check, or a next step…",
                        )}
                        onChange={(e) =>
                          update(editFinding(finding, { note: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="finding-actions">
                    <label>
                      <Checkbox
                        checked={status === "reviewed"}
                        disabled={status === "changed" || status === "missing"}
                        onCheckedChange={(checked) =>
                          update({
                            ...finding,
                            reviewedAt: checked
                              ? new Date().toISOString()
                              : undefined,
                          })
                        }
                      />
                      {t("标记为已核对", "Mark as reviewed")}
                    </label>
                    <span className="finding-actions-right">
                      <button
                        className="quiet-link"
                        onClick={() => setEditing(finding)}
                      >
                        <Pencil size={14} />
                        {t("编辑", "Edit")}
                      </button>
                      <button
                        className="primary-button"
                        disabled={!valid}
                        onClick={() => onAdd(finding)}
                      >
                        <Bookmark size={16} />
                        {t("加入简报", "Add to brief")}
                      </button>
                    </span>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <footer className="notebook-footer">
        <button
          disabled={notebook.findings.length >= notebookLimits.findings}
          className="quiet-link"
          onClick={() =>
            setEditing({
              id: uid(),
              questionId: question.id,
              value: "",
              kind: "unknown",
              evidence: [],
              note: "",
            })
          }
        >
          <Plus size={17} />
          {t("添加发现", "Add finding")}
        </button>
        <button className="source-link" onClick={onBrief}>
          {t("查看简报", "View brief")}
          <ArrowUpRight size={15} />
        </button>
      </footer>
      {editing && (
        <CellEditor
          key={editing.id}
          project={project}
          language={language}
          comparison={{
            objective: notebook.objective,
            constraints: "",
            recommendation: "",
            limitations: "",
            options: [
              {
                id: editing.id,
                name: t("研究发现", "Finding"),
                sourceIds: project.sources.map((s) => s.id),
              },
            ],
            criteria: [{ id: question.id, name: question.title }],
            cells: [
              { ...editing, optionId: editing.id, criterionId: question.id },
            ],
          }}
          optionId={editing.id}
          criterionId={question.id}
          candidates={[]}
          batchSearched={false}
          remaining={0}
          onClose={() => setEditing(null)}
          onSave={(cell) => {
            const saved = {
              ...editing,
              value: cell.value,
              kind: cell.kind,
              evidence: cell.evidence,
              reviewedAt: cell.reviewedAt,
            };
            onChange({
              ...notebook,
              findings: notebook.findings.some((f) => f.id === saved.id)
                ? notebook.findings.map((f) => (f.id === saved.id ? saved : f))
                : [...notebook.findings, saved],
            });
            setExpanded(saved.id);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
