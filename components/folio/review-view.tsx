"use client";
import { useMemo, useState } from "react";
import { ArrowUpRight, CheckCheck, History } from "lucide-react";
import {
  uid,
  type Project,
  type Language,
  type Comparison,
  type ComparisonCell,
} from "@/lib/folio/model";
import {
  projectReview,
  type CitationTarget,
  type ReviewItem,
} from "@/lib/folio/review";
import { CellEditor } from "./comparison-view";

export default function ReviewView({
  project,
  language,
  initialSource = "",
  onReview,
  onChange,
  onBrief,
  onDelivery,
}: {
  project: Project;
  language: Language;
  initialSource?: string;
  onReview: (target: CitationTarget) => void;
  onChange: (patch: Partial<Project>) => void;
  onBrief: () => void;
  onDelivery: () => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [scope, setScope] = useState<"all" | ReviewItem["scope"]>("all");
  const [sourceId, setSourceId] = useState(
    project.sources.some((s) => s.id === initialSource) ? initialSource : "",
  );
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<string | null>(null);
  const items = useMemo(() => projectReview(project), [project]);
  const names = {
    all: t("全部", "All"),
    findings: t("研究发现", "Findings"),
    comparison: t("比较表", "Comparison"),
    brief: t("简报", "Brief"),
  };
  const labels = {
    missing: t("需要补证据", "Evidence needed"),
    changed: t("原文已变", "Passage changed"),
    older: t("有新版本", "Newer version"),
    unreviewed: t("尚未核对", "Not reviewed"),
  };
  const visible = items.filter(
    (item) =>
      (scope === "all" || item.scope === scope) &&
      (!sourceId || item.sourceIds.includes(sourceId)) &&
      (filter === "all" ||
        (filter === "updates"
          ? item.status === "changed" || item.status === "older"
          : item.status === filter)),
  );
  const active = items.find((item) => item.id === editing);
  const finding =
    active?.scope === "findings"
      ? project.notebook?.findings.find((f) => f.id === active.findingId)
      : undefined;
  const comparison: Comparison | undefined = finding
    ? {
        objective: project.notebook!.objective,
        constraints: "",
        recommendation: "",
        limitations: "",
        options: [
          {
            id: finding.id,
            name: t("研究发现", "Finding"),
            sourceIds: project.sources.map((s) => s.id),
          },
        ],
        criteria: [{ id: finding.questionId, name: active!.title }],
        cells: [
          { ...finding, optionId: finding.id, criterionId: finding.questionId },
        ],
      }
    : active?.scope === "comparison"
      ? project.comparison
      : undefined;
  const editable = visible.filter((item) => item.scope !== "brief");
  const position = editable.findIndex((item) => item.id === editing);
  const save = (cell: ComparisonCell) => {
    if (!active) return;
    const before =
      finding ||
      project.comparison?.cells.find(
        (c) =>
          c.optionId === active.optionId &&
          c.criterionId === active.criterionId,
      );
    if (!before || active.scope === "brief") return;
    const history = [
      {
        id: uid(),
        title: active.title,
        createdAt: new Date().toISOString(),
        scope: active.scope,
        before: structuredClone(before),
      },
      ...(project.reviewHistory || []),
    ].slice(0, 30);
    if (finding && project.notebook)
      onChange({
        notebook: {
          ...project.notebook,
          findings: project.notebook.findings.map((f) =>
            f.id === finding.id
              ? {
                  ...f,
                  value: cell.value,
                  kind: cell.kind,
                  evidence: cell.evidence,
                  reviewedAt: cell.reviewedAt,
                }
              : f,
          ),
        },
        reviewHistory: history,
      });
    else if (project.comparison)
      onChange({
        comparison: {
          ...project.comparison,
          cells: project.comparison.cells.map((c) =>
            c.optionId === cell.optionId && c.criterionId === cell.criterionId
              ? cell
              : c,
          ),
        },
        reviewHistory: history,
      });
    setEditing(editable[position + 1]?.id || null);
  };
  return (
    <section className="collection-page review-hub">
      <div className="collection-header">
        <div>
          <span className="overline">
            {t("每个结论，都有来处", "KEEP THE REASONING IN VIEW")}
          </span>
          <h1>{t("研究复核", "Research review")}</h1>
          <p>
            {t(
              "跨问题检查来源与结论。每处修改由你确认，简报和发现各自保留。",
              "Review sources and conclusions across questions. Findings and the brief remain independent.",
            )}
          </p>
        </div>
        <button className="secondary-button" onClick={onDelivery}>
          {t("准备交付", "Prepare delivery")}
          <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="review-filters">
        <div
          className="review-scope"
          role="group"
          aria-label={t("复核范围", "Review scope")}
        >
          {(["all", "findings", "brief", "comparison"] as const).map((key) => (
            <button
              key={key}
              aria-pressed={scope === key}
              onClick={() => setScope(key)}
            >
              {names[key]}
              <span>
                {items.filter((i) => key === "all" || i.scope === key).length}
              </span>
            </button>
          ))}
        </div>
        <div className="review-selects">
          <select
            aria-label={t("筛选来源", "Filter source")}
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          >
            <option value="">{t("所有来源", "All sources")}</option>
            {project.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            aria-label={t("筛选状态", "Filter status")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">{t("所有待处理项", "All open items")}</option>
            <option value="updates">
              {t("来源版本更新", "Source updates")}
            </option>
            <option value="missing">
              {t("需要补证据", "Evidence needed")}
            </option>
            <option value="unreviewed">
              {t("尚未人工核对", "Not reviewed")}
            </option>
          </select>
        </div>
      </div>
      {visible.length ? (
        <div className="review-list">
          {visible.map((item) => (
            <article className="review-item" key={item.id}>
              <div className="review-item-heading">
                <span className="review-kind">{names[item.scope]}</span>
                <strong>{item.title}</strong>
                <span className={`review-badge review-${item.status}`}>
                  {labels[item.status]}
                </span>
              </div>
              <p className="review-quote">
                {item.value || t("尚未记录结论", "No conclusion recorded")}
              </p>
              <div className="review-item-bottom">
                <span>
                  {item.sourceIds
                    .map(
                      (id) =>
                        project.sources.find((s) => s.id === id)?.name ||
                        t("来源缺失", "Missing source"),
                    )
                    .join(" · ") ||
                    t(
                      "待补充支持结论的资料",
                      "Add evidence for this conclusion",
                    )}
                </span>
                {item.scope === "brief" ? (
                  <button
                    className="secondary-button"
                    onClick={() =>
                      project.sources.some(
                        (s) => s.id === item.target?.attrs.sourceId,
                      )
                        ? onReview(item.target!)
                        : onBrief()
                    }
                  >
                    {t("核对简报引用", "Review brief citation")}
                    <ArrowUpRight size={14} />
                  </button>
                ) : (
                  <button
                    className="secondary-button"
                    onClick={() => setEditing(item.id)}
                  >
                    {t("核对发现", "Review finding")}
                    <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <CheckCheck size={30} />
          <h2>{t("此范围没有待处理项", "No open items in this view")}</h2>
          <p>
            {t(
              "版本检查不代替判断，请继续核实结论是否被原文支持。",
              "Version checks do not establish that a conclusion is supported. Keep your judgment in the loop.",
            )}
          </p>
        </div>
      )}
      {!!project.reviewHistory?.length && (
        <details className="review-history">
          <summary>
            <History size={15} />
            {t("最近的复核修改", "Recent review edits")} ·{" "}
            {project.reviewHistory.length}
          </summary>
          <p>
            {t(
              "保留通过此页修改前的最近 30 条记录；简报引用修改保存在版本记录中。",
              "Keeps the last 30 entries before edits made here. Brief replacements are preserved in version history.",
            )}
          </p>
          {project.reviewHistory.map((r) => (
            <details key={r.id}>
              <summary>
                {r.title} ·{" "}
                {new Date(r.createdAt).toLocaleString(
                  language === "zh" ? "zh-CN" : "en",
                )}
              </summary>
              <p>{r.before.value}</p>
              {r.before.evidence.map((e) => (
                <blockquote key={e.id}>
                  {e.name} · p. {e.page}
                  <br />
                  {e.quote}
                </blockquote>
              ))}
            </details>
          ))}
        </details>
      )}
      {active && comparison && (
        <CellEditor
          key={active.id}
          project={project}
          comparison={comparison}
          language={language}
          optionId={finding?.id || active.optionId!}
          criterionId={finding?.questionId || active.criterionId!}
          candidates={[]}
          batchSearched={false}
          remaining={Math.max(0, editable.length - position - 1)}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </section>
  );
}
