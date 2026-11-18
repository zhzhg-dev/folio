import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Plus,
  Search,
  X,
  FileText,
  ArrowRight,
  Loader2,
  Link2,
} from "lucide-react";
import { isLinkedFindingArchived } from "@/lib/folio/conclusions";
import DecisionProgress from "./decision-progress";
import type { DecisionAction } from "@/lib/folio/decision-progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { comparisonLimits } from "@/lib/folio/comparison";
import {
  uid,
  type Project,
  type Language,
  type Comparison,
  type ComparisonCell,
  type Evidence,
} from "@/lib/folio/model";
import { evidenceExists } from "@/lib/folio/research";
import { errorMessage } from "@/lib/folio/i18n";
import {
  findComparisonCandidates,
  findComparisonCellCandidates,
} from "@/lib/folio/comparison-task";
import {
  cellKey,
  comparisonSearchKey,
  comparisonQueryLines,
  comparisonQueryLimits,
  storedComparisonQuery,
  reviewItems,
  currentQuote,
  type CandidateResult,
  type CellAddress,
  type ReviewFilter,
} from "@/lib/folio/comparison-search";

type Props = {
  project: Project;
  language: Language;
  onChange: (value: Comparison) => boolean;
  onImport: (optionId?: string) => void;
  onReviewLink: (blockId: string) => void;
  onReviewBrief: () => void;
  onOrganize: () => void;
  onRestoreQuestion: (id: string) => void;
  onBrief: () => void;
  onDelivery: (id?: string) => void;
  onBuild: () => void;
  onConnect: () => void;
  onOpenFinding: (id: string) => void;
};
export default function ComparisonView({
  project,
  language,
  onChange,
  onImport,
  onReviewLink,
  onReviewBrief,
  onOrganize,
  onRestoreQuestion,
  onBrief,
  onDelivery,
  onBuild,
  onConnect,
  onOpenFinding,
}: Props) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const c = project.comparison;
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const sourcePickers = useRef(new Map<string, HTMLDetailsElement>());
  const recommendation = useRef<HTMLTextAreaElement>(null);
  const limitations = useRef<HTMLTextAreaElement>(null);
  const [queue, setQueue] = useState<CellAddress[]>([]);
  const [candidates, setCandidates] = useState<{
    key: string;
    items: CandidateResult[];
  } | null>(null);
  const [batchProgress, setBatchProgress] = useState<number | null>(null);
  const [batchError, setBatchError] = useState("");
  const batch = useRef<AbortController | null>(null);
  const searchKey = comparisonSearchKey(project);
  const latestKey = useRef(searchKey);
  latestKey.current = searchKey;
  useEffect(() => {
    batch.current?.abort();
    setBatchProgress(null);
    setBatchError("");
    return () => batch.current?.abort();
  }, [searchKey]);
  const candidateItems = candidates?.key === searchKey ? candidates.items : [];
  const allItems = useMemo(
    () => reviewItems(project),
    [c?.cells, c?.options, c?.criteria, project.sources],
  );
  const visibleItems =
    filter === "all"
      ? allItems
      : allItems.filter((item) => item.status === filter);
  const entries = useMemo(
    () => new Map(allItems.map((item) => [cellKey(item), item])),
    [allItems],
  );
  const batchSearch = async () => {
    batch.current?.abort();
    const controller = new AbortController();
    batch.current = controller;
    const key = searchKey;
    setBatchProgress(0);
    setBatchError("");
    try {
      const items = await findComparisonCandidates(
        project,
        controller.signal,
        (completed) => {
          if (!controller.signal.aborted && latestKey.current === key)
            setBatchProgress(completed);
        },
      );
      if (!controller.signal.aborted && latestKey.current === key)
        setCandidates({ key, items });
    } catch (error) {
      if (!controller.signal.aborted && latestKey.current === key)
        setBatchError(errorMessage(error, language));
    } finally {
      if (batch.current === controller) {
        setBatchProgress(null);
        batch.current = null;
      }
    }
  };
  const [editing, setEditing] = useState<{
    optionId: string;
    criterionId: string;
  } | null>(null);
  const [removing, setRemoving] = useState<{
    type: "option" | "criterion";
    id: string;
    name: string;
  } | null>(null);
  const counts = useMemo(() => {
    const totals = {
      total: allItems.length,
      changed: 0,
      reviewed: 0,
      missing: 0,
      unreviewed: 0,
    };
    for (const item of allItems) totals[item.status]++;
    return totals;
  }, [allItems]);
  const independentCount =
    c?.cells.filter(
      (cell) => !cell.findingId && (cell.value.trim() || cell.evidence.length),
    ).length || 0;
  const archivedCell = (cell: ComparisonCell | undefined) =>
    !!cell?.findingId && isLinkedFindingArchived(project, cell);
  const statusLabel = (status: string) =>
    ({
      reviewed: t("已核对", "Reviewed"),
      unreviewed: t("未核对", "Not reviewed"),
      changed: t("来源更新", "Source updated"),
      missing: t("待确认", "To confirm"),
    })[status];
  if (!c) return null;
  const act = (action: DecisionAction) => {
    switch (action.type) {
      case "review-cell":
        setQueue([]);
        setEditing({
          optionId: action.optionId,
          criterionId: action.criterionId,
        });
        return;
      case "import":
        return onImport(action.optionId);
      case "attach": {
        setFilter("all");
        const picker = sourcePickers.current.get(action.optionId);
        if (picker) {
          picker.open = true;
          requestAnimationFrame(() => {
            picker.scrollIntoView({ block: "center", inline: "nearest" });
            picker.querySelector("summary")?.focus({ preventScroll: true });
          });
        }
        return;
      }
      case "restore-finding":
        return onOpenFinding(action.findingId);
      case "restore-question":
        return onRestoreQuestion(action.questionId);
      case "organize":
        return onOrganize();
      case "open-brief":
        return onBrief();
      case "recommend":
        (action.field === "limitations"
          ? limitations
          : recommendation
        ).current?.focus();
        return;
      case "insert-brief":
        return onBuild();
      case "update-brief":
        return onReviewLink(action.blockId);
      case "review-brief":
        return onReviewBrief();
      case "prepare-edition":
        return onDelivery();
      case "open-edition":
        return onDelivery(action.deliveryId);
    }
  };
  const change = (patch: Partial<Comparison>) => onChange({ ...c, ...patch });
  const updateOption = (
    id: string,
    patch: Partial<Comparison["options"][number]>,
  ) =>
    change({
      options: c.options.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      ...(patch.name !== undefined
        ? {
            cells: c.cells.map((cell) =>
              cell.optionId === id ? { ...cell, reviewedAt: undefined } : cell,
            ),
          }
        : {}),
    });
  return (
    <section className="comparison-view">
      <header className="comparison-heading">
        <div>
          <h1>{c.objective || t("方案比较", "Compare options")}</h1>
        </div>
        <button className="secondary-button" onClick={onBuild}>
          <FileText size={16} />
          {t("写入研究简报", "Build decision brief")}
        </button>
      </header>
      <DecisionProgress project={project} language={language} onAction={act} />
      {!c.findingsLinked && (
        <div className="comparison-linkbar">
          <Link2 size={17} aria-hidden="true" />
          <div>
            <strong>
              {t(
                "把比较与研究发现关联起来",
                "Connect comparison entries to your findings",
              )}
            </strong>
            <p>
              {t(
                "关联后可在两处编辑同一条结论。",
                "Once connected, you can edit the same conclusion in either view.",
              )}
            </p>
          </div>
          <button className="secondary-button" onClick={onConnect}>
            {t("关联比较", "Connect comparison")}
            {independentCount > 0 && <span>{independentCount}</span>}
          </button>
        </div>
      )}
      <details className="decision-details">
        <summary>
          {t("编辑决策目标与约束", "Edit objective and constraints")}
        </summary>
        <div className="comparison-intent">
          <label>
            <span>{t("这次要做什么决定？", "What are you deciding?")}</span>
            <textarea
              rows={2}
              maxLength={10000}
              value={c.objective}
              placeholder={t(
                "例如：为五人团队选择客服软件",
                "e.g. Choose support software for a team of five",
              )}
              onChange={(e) => change({ objective: e.target.value })}
            />
          </label>
          <label>
            <span>{t("必须满足的条件", "What matters most?")}</span>
            <textarea
              rows={2}
              maxLength={10000}
              value={c.constraints}
              placeholder={t(
                "预算、必须具备的能力、限制…",
                "Budget, requirements, constraints…",
              )}
              onChange={(e) => change({ constraints: e.target.value })}
            />
          </label>
        </div>
      </details>
      <div className="comparison-summary">
        <span>
          <Check size={15} />
          {counts.reviewed}/{counts.total} {t("已核对", "reviewed")}
        </span>
        {counts.changed > 0 && (
          <span className="needs-attention">
            {counts.changed} {t("项来源更新", "findings to revisit")}
          </span>
        )}
        <span>
          {counts.missing} {t("项待确认", "to confirm")}
        </span>
        <button onClick={() => onImport()}>
          <Plus size={14} />
          {t("添加资料", "Add sources")}
        </button>
      </div>
      <div className="comparison-workbar">
        <div
          className="comparison-filters"
          aria-label={t("核对筛选", "Review filters")}
        >
          {(
            ["all", "changed", "unreviewed", "missing", "reviewed"] as const
          ).map((value) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? t("全部", "All findings") : statusLabel(value)}
              <span>{value === "all" ? counts.total : counts[value]}</span>
            </button>
          ))}
        </div>
        <div className="comparison-work-actions">
          <button
            className="secondary-button"
            disabled={
              !c.options.some((o) => o.sourceIds.length) ||
              batchProgress !== null
            }
            onClick={() => void batchSearch()}
          >
            {batchProgress !== null ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Search size={16} />
            )}
            {t("批量找证据", "Find evidence for all")}
          </button>
          <button
            className="text-action"
            disabled={!visibleItems.some((item) => item.status !== "reviewed")}
            onClick={() => {
              const items = visibleItems.filter(
                (item) => item.status !== "reviewed",
              );
              const editable = items.filter((item) => !archivedCell(item.cell));
              setEditing(editable[0] || null);
              setQueue(editable.slice(1));
            }}
          >
            {t("连续核对", "Start review")}
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
      <div
        className="comparison-search-status"
        role="status"
        aria-live="polite"
      >
        {batchProgress !== null ? (
          <>
            <span>
              {t("正在查找候选片段", "Finding candidate passages")} ·{" "}
              {batchProgress}/{counts.total}
            </span>
            <button
              className="text-action"
              onClick={() => {
                batch.current?.abort();
                setBatchProgress(null);
              }}
            >
              {t("取消", "Cancel")}
            </button>
          </>
        ) : candidateItems.length ? (
          <span>
            {candidateItems.filter((item) => item.evidence.length).length}/
            {counts.total}{" "}
            {t(
              "项找到候选片段。请打开核对；未修改你的发现。",
              "findings have candidates. Open to check; your findings are unchanged.",
            )}
            {candidateItems.some((item) => !item.linked) &&
              " " +
                t(
                  "部分方案尚未关联资料。",
                  "Some options have no linked sources.",
                )}
          </span>
        ) : (
          <span>
            {t(
              "按维度检索关联资料；未命中时，可在维度名称下按行填写原文用词或不同语言的检索词，也可打开单元格手工选取原文。",
              "Search linked sources by criterion. If nothing matches, add original wording or different-language terms on separate lines below a criterion, or open a cell to select original text manually.",
            )}
          </span>
        )}
      </div>
      {batchError && (
        <p className="inline-error" role="alert">
          {batchError}
        </p>
      )}
      {filter !== "all" && (
        <div className="comparison-review-list">
          {visibleItems.length ? (
            visibleItems.map((item) => (
              <button
                key={cellKey(item)}
                className="comparison-review-row"
                disabled={archivedCell(item.cell)}
                onClick={() => {
                  setQueue([]);
                  setEditing(item);
                }}
              >
                <span className={`cell-status ${item.status}`}>
                  {statusLabel(item.status)}
                </span>
                <span>
                  <strong>
                    {item.option} <span className="dialog-slash">/</span>{" "}
                    {item.criterion}
                  </strong>
                  <span>
                    {item.cell?.value ||
                      t("尚未记录发现", "No finding recorded")}
                  </span>
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))
          ) : (
            <p className="comparison-help">
              {t(
                "这里已经处理完了。切换筛选继续查看。",
                "Nothing in this view. Choose another filter to continue.",
              )}
            </p>
          )}
        </div>
      )}
      <div
        className="comparison-table-scroll"
        hidden={filter !== "all"}
        tabIndex={0}
        role="region"
        aria-label={t("方案比较表", "Options comparison table")}
      >
        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="comparison-kicker">
                  {t("比较维度", "CRITERIA")}
                </span>
                <p>
                  {t(
                    "点开单元格，记录发现和依据。",
                    "Open a cell to record a finding and its evidence.",
                  )}
                </p>
              </th>
              {c.options.map((o) => (
                <th scope="col" key={o.id}>
                  <div className="matrix-item-title">
                    <input
                      aria-label={t("方案名称", "Option name")}
                      value={o.name}
                      maxLength={200}
                      onChange={(e) =>
                        updateOption(o.id, { name: e.target.value })
                      }
                    />
                    <button
                      className="matrix-remove"
                      disabled={c.options.length <= 1}
                      aria-label={t("移除方案：", "Remove option: ") + o.name}
                      onClick={() =>
                        setRemoving({ type: "option", id: o.id, name: o.name })
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <details
                    className="option-sources"
                    ref={(node) => {
                      if (node) sourcePickers.current.set(o.id, node);
                      else sourcePickers.current.delete(o.id);
                    }}
                  >
                    <summary>
                      {o.sourceIds.length}{" "}
                      {t(
                        "份关联资料",
                        o.sourceIds.length === 1
                          ? "linked source"
                          : "linked sources",
                      )}
                    </summary>
                    <div>
                      {project.sources.map((s) => (
                        <label key={s.id}>
                          <input
                            type="checkbox"
                            checked={o.sourceIds.includes(s.id)}
                            onChange={(e) =>
                              updateOption(o.id, {
                                sourceIds: e.target.checked
                                  ? [...o.sourceIds, s.id]
                                  : o.sourceIds.filter((id) => id !== s.id),
                              })
                            }
                          />
                          {s.name}
                        </label>
                      ))}
                      <button onClick={() => onImport(o.id)}>
                        {t("为此方案导入资料", "Import for this option")}
                      </button>
                    </div>
                  </details>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.criteria.map((r) => (
              <tr key={r.id}>
                <th scope="row">
                  <div className="matrix-item-title">
                    <input
                      aria-label={t("维度名称", "Criterion name")}
                      value={r.name}
                      maxLength={200}
                      onChange={(e) =>
                        change({
                          criteria: c.criteria.map((x) =>
                            x.id === r.id ? { ...x, name: e.target.value } : x,
                          ),
                          cells: c.cells.map((cell) =>
                            cell.criterionId === r.id
                              ? { ...cell, reviewedAt: undefined }
                              : cell,
                          ),
                        })
                      }
                    />
                    <button
                      className="matrix-remove"
                      disabled={c.criteria.length <= 1}
                      aria-label={
                        t("移除维度：", "Remove criterion: ") + r.name
                      }
                      onClick={() =>
                        setRemoving({
                          type: "criterion",
                          id: r.id,
                          name: r.name,
                        })
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <details className="criterion-query">
                    <summary>{t("检索词", "Search terms")}</summary>
                    <CriterionSearchTerms
                      language={language}
                      name={r.name}
                      placeholder={r.name}
                      value={r.query || ""}
                      onChange={(value) =>
                        change({
                          criteria: c.criteria.map((x) =>
                            x.id === r.id ? { ...x, query: value } : x,
                          ),
                        })
                      }
                    />
                  </details>
                </th>
                {c.options.map((o) => {
                  const { cell, status } = entries.get(
                    cellKey({ optionId: o.id, criterionId: r.id }),
                  )!;
                  return (
                    <td key={o.id}>
                      <button
                        className={`comparison-cell cell-${status}`}
                        aria-label={`${o.name} / ${r.name}`}
                        disabled={archivedCell(cell)}
                        onClick={() => {
                          setQueue([]);
                          setEditing({ optionId: o.id, criterionId: r.id });
                        }}
                      >
                        <span className="cell-topline">
                          <span className={`cell-status ${status}`}>
                            {statusLabel(status)}
                          </span>
                          {cell?.kind === "judgment" && (
                            <span>{t("个人判断", "Judgment")}</span>
                          )}
                          <ArrowUpRight size={13} />
                        </span>
                        <span
                          className={`cell-value ${!cell?.value ? "is-empty" : ""}`}
                        >
                          {cell?.value || t("添加发现", "Add a finding")}
                        </span>
                        <span className="cell-evidence">
                          {archivedCell(cell)
                            ? t(
                                "发现已归档，恢复后可编辑",
                                "Finding archived. Restore to edit.",
                              )
                            : cell?.evidence.length
                              ? `${cell.evidence.length} ${t("条引用", cell.evidence.length === 1 ? "citation" : "citations")}`
                              : t("尚未附上证据", "No evidence attached")}
                        </span>
                        {!!candidateItems.find(
                          (item) =>
                            item.optionId === o.id && item.criterionId === r.id,
                        )?.evidence.length && (
                          <span className="cell-candidates">
                            {t("候选证据可核对", "Candidates ready")}
                          </span>
                        )}
                      </button>
                      {cell?.findingId && (
                        <button
                          className="comparison-finding-link"
                          onClick={() => onOpenFinding(cell.findingId!)}
                        >
                          <Link2 size={12} aria-hidden="true" />
                          {archivedCell(cell)
                            ? t("恢复关联发现", "Restore linked finding")
                            : t("查看关联发现", "Open linked finding")}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="comparison-add">
        <button
          disabled={c.criteria.length >= comparisonLimits.criteria}
          onClick={() =>
            change({
              criteria: [
                ...c.criteria,
                { id: uid(), name: t("新维度", "New criterion") },
              ],
            })
          }
        >
          <Plus size={15} />
          {t("添加维度", "Add criterion")}
        </button>
        <button
          disabled={c.options.length >= comparisonLimits.options}
          onClick={() =>
            change({
              options: [
                ...c.options,
                { id: uid(), name: t("新方案", "New option"), sourceIds: [] },
              ],
            })
          }
        >
          <Plus size={15} />
          {t("添加方案", "Add option")}
        </button>
        <span>
          {t("最多 6 个方案、12 个维度", "Up to 6 options and 12 criteria")}
        </span>
      </div>
      <div className="comparison-conclusion">
        <label>
          <span>{t("你的建议与理由", "Your recommendation & reasoning")}</span>
          <textarea
            maxLength={10000}
            rows={4}
            value={c.recommendation}
            ref={recommendation}
            onChange={(e) => change({ recommendation: e.target.value })}
            placeholder={t(
              "你倾向哪个方案？哪些取舍影响了判断？",
              "Which option would you choose, and what trade-offs shaped your decision?",
            )}
          />
        </label>
        <label>
          <span>{t("限制与待确认事项", "Limitations & open questions")}</span>
          <textarea
            maxLength={10000}
            rows={4}
            value={c.limitations}
            ref={limitations}
            onChange={(e) => change({ limitations: e.target.value })}
            placeholder={t(
              "还缺少哪些资料？哪些条件尚未验证？",
              "What is missing or still needs to be verified?",
            )}
          />
        </label>
      </div>
      <p className="comparison-footnote">
        {t(
          "“已核对”表示你已人工检查。资料出现新版本后需复核。关联简报不会重复写入；比较变化后，可预览并确认更新，原稿保存在版本记录中。",
          "Reviewed means you checked the finding yourself. New source revisions need review. A linked brief is added once; preview and confirm later updates. Version history keeps the earlier writing.",
        )}
      </p>
      {editing &&
        !archivedCell(
          c.cells.find(
            (cell) =>
              cell.optionId === editing.optionId &&
              cell.criterionId === editing.criterionId,
          ),
        ) && (
          <CellEditor
            key={`${editing.optionId}-${editing.criterionId}`}
            project={project}
            comparison={c}
            language={language}
            optionId={editing.optionId}
            criterionId={editing.criterionId}
            candidates={
              candidateItems.find((item) => cellKey(item) === cellKey(editing))
                ?.evidence || []
            }
            batchSearched={candidateItems.length > 0}
            remaining={queue.length}
            onClose={() => {
              setEditing(null);
              setQueue([]);
            }}
            onSave={(cell) => {
              const saved = change({
                cells: [
                  ...c.cells.filter(
                    (x) =>
                      x.optionId !== cell.optionId ||
                      x.criterionId !== cell.criterionId,
                  ),
                  cell,
                ],
              });
              if (!saved) return;
              setEditing(queue[0] || null);
              setQueue(queue.slice(1));
            }}
          />
        )}
      <Dialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <DialogContent className="folio-dialog">
          <DialogHeader>
            <DialogTitle>
              {t("移除", "Remove ")}
              {removing?.name}?
            </DialogTitle>
            <DialogDescription>
              {t(
                "对应的比较记录会被移除。已写入的简报和原始资料会保留。",
                "The associated comparison entries will be removed. Existing briefs and source files are preserved.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="comparison-dialog-actions">
            <button
              className="secondary-button"
              onClick={() => setRemoving(null)}
            >
              {t("取消", "Cancel")}
            </button>
            <button
              className="primary-button"
              onClick={() => {
                if (!removing) return;
                change(
                  removing.type === "option"
                    ? {
                        options: c.options.filter((o) => o.id !== removing.id),
                        cells: c.cells.filter(
                          (x) => x.optionId !== removing.id,
                        ),
                      }
                    : {
                        criteria: c.criteria.filter(
                          (r) => r.id !== removing.id,
                        ),
                        cells: c.cells.filter(
                          (x) => x.criterionId !== removing.id,
                        ),
                      },
                );
                setRemoving(null);
              }}
            >
              {t("移除", "Remove")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function CriterionSearchTerms({
  value,
  name,
  placeholder,
  language,
  onChange,
}: {
  value: string;
  name: string;
  placeholder: string;
  language: Language;
  onChange: (value: string) => boolean;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const helpId = useId();
  const legacyLines =
    storedComparisonQuery({ name: "", query: value }) !== value.trim();
  useEffect(() => {
    setDraft(value);
    setError("");
  }, [value]);
  return (
    <>
      <textarea
        aria-label={t("检索词：", "Search terms: ") + name}
        aria-describedby={helpId}
        aria-invalid={!!error}
        maxLength={comparisonQueryLimits.characters}
        rows={3}
        placeholder={placeholder}
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          try {
            comparisonQueryLines(next);
            setError("");
            if (!onChange(next)) setDraft(value);
          } catch (cause) {
            setError(
              errorMessage(cause, language) +
                " " +
                t("此次修改尚未保存。", "This edit has not been saved."),
            );
          }
        }}
      />
      <p
        id={helpId}
        className={error ? "inline-error" : "comparison-help"}
        role={error ? "alert" : undefined}
      >
        {error ||
          (legacyLines && draft === value
            ? t(
                "已保留旧版多行检索词；查找时会用空格合并为一条，不改动保存内容。编辑后请控制在 3 行以内，共 500 字。",
                "Your older multiline terms are preserved. Search joins them with spaces as one query without rewriting the saved text. New edits must use at most 3 lines and 500 characters.",
              )
            : t(
                "最多 3 行，共 500 字。每行单独检索，可分别写中文、英文或原文中的术语；不会自动翻译或核对结论。留空使用维度名称。",
                "Up to 3 lines, 500 characters total. Each line searches separately: use English, Chinese or the source's wording. No automatic translation or review. Leave blank to use the criterion name.",
              ))}
      </p>
    </>
  );
}

export function CellEditor({
  project,
  comparison,
  language,
  optionId,
  criterionId,
  candidates,
  batchSearched,
  remaining,
  onClose,
  onSave,
}: {
  project: Project;
  comparison: Comparison;
  language: Language;
  optionId: string;
  criterionId: string;
  candidates: Evidence[];
  batchSearched: boolean;
  remaining: number;
  onClose: () => void;
  onSave: (cell: ComparisonCell) => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const option = comparison.options.find((o) => o.id === optionId)!;
  const criterion = comparison.criteria.find((r) => r.id === criterionId)!;
  const [cell, setCell] = useState<ComparisonCell>(() =>
    structuredClone(
      comparison.cells.find(
        (c) => c.optionId === optionId && c.criterionId === criterionId,
      ) || { optionId, criterionId, value: "", kind: "unknown", evidence: [] },
    ),
  );
  const [query, setQuery] = useState(() => storedComparisonQuery(criterion));
  const [results, setResults] = useState<Evidence[]>(candidates);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(batchSearched);
  const [error, setError] = useState("");
  const [sourceId, setSourceId] = useState(
    option.sourceIds[0] || project.sources[0]?.id || "",
  );
  const [pageNumber, setPageNumber] = useState(1);
  const [quote, setQuote] = useState("");
  const [pageLimit, setPageLimit] = useState(20000);
  const pending = useRef<AbortController | null>(null);
  // A notebook finding or a review item supplies its own option and source scope.
  const searchProject =
    project.comparison === comparison ? project : { ...project, comparison };
  const searchKey = JSON.stringify([
    comparisonSearchKey(searchProject),
    optionId,
    criterionId,
    query,
  ]);
  const latestSearchKey = useRef(searchKey);
  const previousSearchKey = useRef(searchKey);
  latestSearchKey.current = searchKey;
  const queryHelpId = useId();
  let queryError = "";
  try {
    comparisonQueryLines(query);
  } catch (cause) {
    queryError = errorMessage(cause, language);
  }
  useEffect(() => {
    setQuery(storedComparisonQuery(criterion));
  }, [criterion.query, criterion.name]);
  useEffect(() => {
    if (previousSearchKey.current !== searchKey) {
      pending.current?.abort();
      setBusy(false);
      setSearched(false);
      setResults([]);
      setError("");
      previousSearchKey.current = searchKey;
    }
    return () => pending.current?.abort();
  }, [searchKey]);
  useEffect(() => setPageLimit(20000), [sourceId, pageNumber]);
  const edit = (patch: Partial<ComparisonCell>) =>
    setCell((current) => ({ ...current, ...patch, reviewedAt: undefined }));
  const source = project.sources.find((s) => s.id === sourceId);
  const version = source?.versions.at(-1);
  const page =
    version?.pages.find((p) => p.page === pageNumber) || version?.pages[0];
  const attach = (e: Evidence) => {
    if (cell.evidence.length >= comparisonLimits.evidence) {
      setError(t("每项最多 8 条引用。", "Up to 8 citations per finding."));
      return;
    }
    if (
      !cell.evidence.some(
        (x) =>
          x.sourceId === e.sourceId &&
          x.versionId === e.versionId &&
          x.page === e.page &&
          x.quote === e.quote,
      )
    )
      edit({ evidence: [...cell.evidence, { ...e, id: uid() }] });
    setError("");
  };
  const search = async () => {
    pending.current?.abort();
    if (queryError || !query.trim()) return;
    const controller = new AbortController();
    pending.current = controller;
    const key = searchKey;
    setBusy(true);
    setError("");
    setSearched(false);
    setResults([]);
    try {
      const found = await findComparisonCellCandidates(
        searchProject,
        { optionId, criterionId },
        query,
        controller.signal,
      );
      if (
        !controller.signal.aborted &&
        pending.current === controller &&
        latestSearchKey.current === key
      ) {
        setResults(found);
        setSearched(true);
      }
    } catch (e) {
      if (
        !controller.signal.aborted &&
        pending.current === controller &&
        latestSearchKey.current === key
      )
        setError(errorMessage(e, language));
    } finally {
      if (pending.current === controller) {
        setBusy(false);
        pending.current = null;
      }
    }
  };
  const currentEvidence = cell.evidence.every(
    (e) =>
      evidenceExists(e, project) &&
      project.sources.find((s) => s.id === e.sourceId)?.versions.at(-1)?.id ===
        e.versionId,
  );
  const canReview =
    !!cell.value.trim() &&
    cell.kind !== "unknown" &&
    currentEvidence &&
    (cell.kind !== "fact" || cell.evidence.length > 0);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="folio-dialog comparison-cell-dialog">
        <DialogHeader>
          <DialogTitle>
            {option.name} <span className="dialog-slash">/</span>{" "}
            {criterion.name}
          </DialogTitle>
          <DialogDescription>
            {t(
              "记录你的发现，再检查原文是否支持这个表述。",
              "Record your finding, then check whether the original passage supports it.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="cell-editor-body">
          <div className="cell-editor-main">
            <label className="comparison-field">
              <span>{t("发现", "Finding")}</span>
              <textarea
                aria-label={t("发现", "Finding")}
                value={cell.value}
                maxLength={10000}
                rows={4}
                onChange={(e) => edit({ value: e.target.value })}
              />
            </label>
            <label className="comparison-field">
              <span>{t("内容类型", "Type of finding")}</span>
              <select
                value={cell.kind}
                onChange={(e) =>
                  edit({ kind: e.target.value as ComparisonCell["kind"] })
                }
              >
                <option value="unknown">{t("待确认信息", "To confirm")}</option>
                <option value="fact">{t("事实记录", "Recorded fact")}</option>
                <option value="judgment">
                  {t("个人判断", "Personal judgment")}
                </option>
              </select>
            </label>
            <h3>{t("已关联的证据", "Attached evidence")}</h3>
            {!cell.evidence.length && (
              <p className="comparison-help">
                {t(
                  "事实记录需要至少一条原文引用才能标记为已核对。",
                  "A recorded fact needs an original passage before it can be marked reviewed.",
                )}
              </p>
            )}
            {cell.evidence.map((e) => (
              <article className="comparison-evidence" key={e.id}>
                <div>
                  <strong>
                    {e.name} · p.{e.page} · v
                    {(project.sources
                      .find((s) => s.id === e.sourceId)
                      ?.versions.findIndex((v) => v.id === e.versionId) ?? -1) +
                      1}
                  </strong>
                  <button
                    aria-label={t("移除引用", "Remove citation")}
                    onClick={() =>
                      edit({
                        evidence: cell.evidence.filter((x) => x.id !== e.id),
                      })
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
                <blockquote>{e.quote}</blockquote>
                {project.sources
                  .find((s) => s.id === e.sourceId)
                  ?.versions.at(-1)?.id !== e.versionId && (
                  <div className="citation-update">
                    <p className="needs-attention">
                      {currentQuote(e, project)
                        ? t(
                            "当前版本仍包含这段原文，请确认适用条件。",
                            "This exact passage is still present. Check whether its conditions still apply.",
                          )
                        : t(
                            "当前版本未找到相同原文，请重新核对。",
                            "This passage is absent from the current version. Recheck your finding.",
                          )}
                    </p>
                    <strong>
                      {t("当前版本 · 同页预览", "Current version · same page")}
                    </strong>
                    <blockquote>
                      {project.sources
                        .find((s) => s.id === e.sourceId)
                        ?.versions.at(-1)
                        ?.pages.find((p) => p.page === e.page)
                        ?.text.slice(0, 700) ||
                        t(
                          "页码已变化，请查看原文。",
                          "Pagination changed. Open the original.",
                        )}
                    </blockquote>
                    {currentQuote(e, project) && (
                      <button
                        className="text-action"
                        onClick={() => {
                          const updated = currentQuote(e, project);
                          if (updated)
                            edit({
                              evidence: cell.evidence.map((x) =>
                                x.id === e.id ? updated : x,
                              ),
                            });
                        }}
                      >
                        {t(
                          "引用当前版本，继续核对",
                          "Use current version & recheck",
                        )}
                      </button>
                    )}
                    <button
                      className="text-action"
                      onClick={() => {
                        setSourceId(e.sourceId);
                        setPageNumber(e.page);
                        setQuote("");
                        document
                          .getElementById("comparison-original-details")
                          ?.setAttribute("open", "");
                        document
                          .getElementById("comparison-original-details")
                          ?.scrollIntoView({ block: "nearest" });
                      }}
                    >
                      {t("查看当前原文", "Read current source")}
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                )}
                {!evidenceExists(e, project) && (
                  <p className="needs-attention">
                    {t(
                      "无法定位这段原文。",
                      "This passage could not be located.",
                    )}
                  </p>
                )}
              </article>
            ))}
            <label className="cell-review-check">
              <input
                type="checkbox"
                disabled={!canReview}
                checked={canReview && !!cell.reviewedAt}
                onChange={(e) =>
                  setCell({
                    ...cell,
                    reviewedAt: e.target.checked
                      ? new Date().toISOString()
                      : undefined,
                  })
                }
              />
              <span>
                {t(
                  "我已核对表述、引用及适用条件",
                  "I checked the wording, evidence and relevant conditions",
                )}
              </span>
            </label>
          </div>
          <aside className="cell-evidence-picker">
            <h3>{t("查找依据", "Find the evidence")}</h3>
            {!!candidates.length && (
              <p className="comparison-help">
                {t(
                  "已带入批量检索的候选片段；它们尚未关联到发现。",
                  "Batch candidates are ready below. They are not attached to your finding yet.",
                )}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
              className="comparison-search"
            >
              <textarea
                aria-label={t("检索词", "Search terms")}
                aria-describedby={queryHelpId}
                aria-invalid={!!queryError}
                rows={3}
                maxLength={comparisonQueryLimits.characters}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                aria-label={t("查找依据", "Find evidence")}
                disabled={
                  busy ||
                  !!queryError ||
                  !query.trim() ||
                  !option.sourceIds.length
                }
              >
                {busy ? (
                  <Loader2 size={17} className="spin" />
                ) : (
                  <Search size={17} />
                )}
              </button>
            </form>
            <p
              id={queryHelpId}
              className={queryError ? "inline-error" : "comparison-help"}
              role={queryError ? "alert" : undefined}
            >
              {queryError ||
                t(
                  "最多 3 行，共 500 字；每行单独检索，可分别输入中英文。这里只用于本次查找，不修改维度的检索词；不会自动翻译或标记已核对。",
                  "Up to 3 lines, 500 characters total. Search each line separately, including different languages. These terms apply to this lookup only. No automatic translation or review.",
                )}
            </p>
            <p className="comparison-help">
              {option.sourceIds.length
                ? t(
                    "仅搜索这里关联的资料；结果是原文片段。",
                    "Searches the linked sources. Results are original passages.",
                  )
                : t(
                    "先在表头关联资料，或在下方直接查看原文。",
                    "Link sources in the column header, or read a source below.",
                  )}
            </p>
            {busy && (
              <button
                className="text-action"
                onClick={() => {
                  pending.current?.abort();
                  setBusy(false);
                }}
              >
                {t("取消检索", "Cancel search")}
              </button>
            )}
            {searched && !results.length && (
              <p className="comparison-help">
                {t(
                  "未找到匹配片段，不代表资料没有相关信息。试用原文中的术语，把不同语言写在不同行，或在下方查看并手工选取原文。",
                  "No matching passages does not mean the information is absent. Try the source's wording, put different languages on separate lines, or read and select original text below.",
                )}
              </p>
            )}
            {results.map((e) => (
              <article className="comparison-evidence" key={e.id}>
                <strong>
                  {e.name} · p.{e.page}
                </strong>
                <blockquote>{e.quote}</blockquote>
                <button className="text-action" onClick={() => attach(e)}>
                  <Plus size={14} />
                  {t("关联此段", "Attach passage")}
                </button>
                {cell.evidence.some(
                  (x) =>
                    x.sourceId === e.sourceId && x.versionId !== e.versionId,
                ) && (
                  <button
                    className="text-action"
                    onClick={() =>
                      edit({
                        evidence: [
                          ...cell.evidence.filter(
                            (x) =>
                              !(
                                x.sourceId === e.sourceId &&
                                x.versionId !== e.versionId
                              ),
                          ),
                          ...(!cell.evidence.some(
                            (x) =>
                              x.sourceId === e.sourceId &&
                              x.versionId === e.versionId &&
                              x.page === e.page &&
                              x.quote === e.quote,
                          )
                            ? [{ ...e, id: uid() }]
                            : []),
                        ],
                      })
                    }
                  >
                    {t(
                      "替换此资料的旧引用",
                      "Replace older citations from this source",
                    )}
                  </button>
                )}
              </article>
            ))}
            <details
              id="comparison-original-details"
              className="manual-evidence"
              open={!option.sourceIds.length || undefined}
            >
              <summary>{t("直接查看原文", "Read the original")}</summary>
              <label>
                <span>{t("资料", "Source")}</span>
                <select
                  value={sourceId}
                  onChange={(e) => {
                    setSourceId(e.target.value);
                    setPageNumber(1);
                    setQuote("");
                  }}
                >
                  <option value="" disabled>
                    {t("选择资料", "Choose a source")}
                  </option>
                  {project.sources.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {version && (
                <>
                  <label>
                    <span>{t("页码", "Page")}</span>
                    <select
                      value={page?.page || 1}
                      onChange={(e) => {
                        setPageNumber(Number(e.target.value));
                        setQuote("");
                      }}
                    >
                      {version.pages.map((p) => (
                        <option key={p.page} value={p.page}>
                          {p.page}
                        </option>
                      ))}
                    </select>
                  </label>
                  <pre className="comparison-original">
                    {page?.text.slice(0, pageLimit)}
                  </pre>
                  {!!page && page.text.length > pageLimit && (
                    <button
                      className="text-action"
                      onClick={() => setPageLimit((current) => current + 20000)}
                    >
                      {t("展开后续原文", "Show more of this page")} ·{" "}
                      {pageLimit.toLocaleString()}/
                      {page.text.length.toLocaleString()}
                    </button>
                  )}
                  <label>
                    <span>
                      {t(
                        "粘贴需要引用的原文",
                        "Paste an exact passage to cite",
                      )}
                    </span>
                    <textarea
                      rows={3}
                      maxLength={10000}
                      value={quote}
                      onChange={(e) => setQuote(e.target.value)}
                    />
                  </label>
                  <button
                    className="secondary-button"
                    disabled={
                      !quote.trim() || !page?.text.includes(quote.trim())
                    }
                    onClick={() => {
                      if (
                        !source ||
                        !version ||
                        !page ||
                        !page.text.includes(quote.trim())
                      )
                        return;
                      attach({
                        id: uid(),
                        sourceId: source.id,
                        versionId: version.id,
                        page: page.page,
                        quote: quote.trim(),
                        name: source.name,
                        label: String(project.sources.indexOf(source) + 1),
                      });
                      setQuote("");
                    }}
                  >
                    <Plus size={14} />
                    {t("关联原文", "Attach exact passage")}
                  </button>
                  {!!quote.trim() && !page?.text.includes(quote.trim()) && (
                    <p className="comparison-help">
                      {t(
                        "这段文字与当前页不一致。",
                        "The passage does not match this page.",
                      )}
                    </p>
                  )}
                </>
              )}
            </details>
          </aside>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="comparison-dialog-actions">
          <button className="secondary-button" onClick={onClose}>
            {t("取消", "Cancel")}
          </button>
          <button
            className="primary-button"
            disabled={!cell.value.trim()}
            onClick={() =>
              onSave({
                ...cell,
                value: cell.value.trim(),
                reviewedAt: canReview ? cell.reviewedAt : undefined,
              })
            }
          >
            <Check size={15} />
            {remaining
              ? t("保存并继续", "Save & next") + ` · ${remaining}`
              : t("保存发现", "Save finding")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
