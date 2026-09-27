"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  MessageSquare,
  Plus,
  ShieldCheck,
  Sparkles,
  Square,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import type {
  Draft,
  Evidence,
  Project,
  Language,
  ResearchState,
  ResearchTurn,
} from "@/lib/folio/model";
import { initialResearch, evidenceExists } from "@/lib/folio/research";
import { findPassagesAsync } from "@/lib/folio/research-task";
import EvidenceReview from "./evidence-review";
import { errorMessage } from "@/lib/folio/i18n";
import {
  loadModel,
  unloadModel,
  generateAnswer,
  subscribeModel,
} from "@/lib/folio/ai";
import type { ReleaseReason } from "@/lib/folio/model-session";

function AnswerCard({
  turn,
  project,
  language,
  onEvidence,
  onAdopt,
  onKeep,
  onReview,
}: {
  turn: ResearchTurn;
  project: Project;
  language: Language;
  onEvidence: (e: Evidence) => void;
  onAdopt: (draft: Draft) => boolean;
  onKeep?: (draft: Draft) => boolean;
  onReview: (ids: string[]) => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [selection, setSelection] = useState<number[]>([]);
  const valid = turn.evidence.every((e) => evidenceExists(e, project));
  const outdated = turn.evidence.some(
    (e) =>
      project.sources.find((s) => s.id === e.sourceId)?.versions.at(-1)?.id !==
      e.versionId,
  );
  return (
    <article className="answer-card">
      <div className="question-row">
        <span className="question-mark">
          <MessageSquare size={16} />
        </span>
        <h2>{turn.question}</h2>
      </div>
      {turn.retrievalQuery !== turn.question && (
        <p className="context-caption">
          {t(
            "沿用上一问题的语境",
            "Includes context from the previous question",
          )}
        </p>
      )}
      <div className="answer-meta">
        <span>
          {turn.mode === "answer" ? (
            <Sparkles size={14} />
          ) : (
            <BookOpen size={14} />
          )}{" "}
          {turn.mode === "answer"
            ? t("本地 AI · 请核对", "LOCAL AI · REVIEW NEEDED")
            : t("原文摘录", "SOURCE PASSAGES")}
        </span>
        <time>
          {new Date(turn.createdAt).toLocaleTimeString(
            language === "zh" ? "zh-CN" : "en",
            { hour: "2-digit", minute: "2-digit" },
          )}
        </time>
      </div>
      {turn.status === "insufficient" ? (
        <div className="answer-insufficient">
          <strong>
            {turn.mode === "passages"
              ? t("暂未找到匹配原文", "No matching passages yet")
              : t("没有找到足够依据", "Not enough evidence")}
          </strong>
          <p>
            {t(
              "试试资料中的一两个关键词，或调整资料范围。没有匹配到原文，并不代表资料中一定没有答案。",
              "Try one or two keywords from your sources, or change the source selection. A missed match does not establish that the answer is absent.",
            )}
          </p>
        </div>
      ) : (
        <>
          {turn.status === "conflicting" && (
            <div className="answer-notice">
              {t(
                "资料可能存在分歧。请分别核对双方原文，回答尚未确定哪一方正确。",
                "Possible disagreement between sources. Check each passage; this answer does not establish which is correct.",
              )}
            </div>
          )}
          {outdated && (
            <div className="answer-notice">
              {t(
                "资料已有新版本；此回答仍保留生成时的原文。",
                "Sources have newer revisions. This response retains the evidence used at the time.",
              )}
            </div>
          )}
          {!valid && (
            <div className="inline-error">
              {t(
                "部分原文无法核对，已暂停写入正文。",
                "Some evidence cannot be verified. Adding this response is disabled.",
              )}
            </div>
          )}
          <div className="answer-paragraphs">
            {turn.paragraphs.map((p, i) => (
              <div
                className={`answer-paragraph ${selection.includes(i) ? "is-selected" : ""}`}
                key={i}
              >
                <Checkbox
                  aria-label={t(
                    `选择第 ${i + 1} 段`,
                    `Select paragraph ${i + 1}`,
                  )}
                  checked={selection.includes(i)}
                  onCheckedChange={(checked) =>
                    setSelection((s) =>
                      checked ? [...s, i] : s.filter((n) => n !== i),
                    )
                  }
                />
                <div>
                  <p>{p.text}</p>
                  <div className="answer-citations">
                    {p.evidenceIds.map((id) => {
                      const e = turn.evidence.find((e) => e.id === id);
                      return e ? (
                        <button
                          key={id}
                          onClick={() => onEvidence(e)}
                          disabled={!evidenceExists(e, project)}
                          title={e.name}
                        >
                          <FileText size={12} />
                          {e.name}
                          <span>
                            · {t("页", "p.")} {e.page}
                          </span>
                          <ArrowUpRight size={12} />
                        </button>
                      ) : null;
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="answer-actions">
            {onKeep && (
              <button
                className="primary-button"
                disabled={!selection.length || !valid}
                onClick={() => {
                  if (
                    onKeep({
                      paragraphs: turn.paragraphs.filter((_, i) =>
                        selection.includes(i),
                      ),
                      evidence: turn.evidence,
                    })
                  )
                    setSelection([]);
                }}
              >
                <Plus size={15} />
                {t("保留为发现", "Keep as findings")}
              </button>
            )}
            <button
              className="text-action"
              onClick={() =>
                setSelection(
                  selection.length === turn.paragraphs.length
                    ? []
                    : turn.paragraphs.map((_, i) => i),
                )
              }
            >
              {selection.length === turn.paragraphs.length
                ? t("取消选择", "Clear selection")
                : t("选择全部", "Select all")}
            </button>
            <button
              className="secondary-button"
              disabled={!selection.length || !valid}
              onClick={() => {
                if (
                  onAdopt({
                    paragraphs: turn.paragraphs.filter((_, i) =>
                      selection.includes(i),
                    ),
                    evidence: turn.evidence,
                  })
                )
                  setSelection([]);
              }}
            >
              <Plus size={15} />
              {t(
                `写入正文${selection.length ? ` · ${selection.length} 段` : ""}`,
                `Add to document${selection.length ? ` · ${selection.length}` : ""}`,
              )}
            </button>
          </div>
        </>
      )}
      <EvidenceReview
        turn={turn}
        project={project}
        language={language}
        onEvidence={onEvidence}
        onReview={onReview}
      />
      {turn.mode === "answer" && turn.status !== "insufficient" && (
        <p className="answer-footnote">
          {t(
            "出处可追溯不代表结论必然正确。点击引用，核对原文后再使用。",
            "Traceable citations do not guarantee a supported claim. Open the passages before using the answer.",
          )}
        </p>
      )}
    </article>
  );
}

export default function Assistant({
  project,
  language,
  onAdopt,
  onKeep,
  onChange,
  onEvidence,
  onImport,
}: {
  project: Project;
  language: Language;
  onAdopt: (draft: Draft) => boolean;
  onKeep?: (draft: Draft) => boolean;
  onChange: (state: ResearchState) => void;
  onEvidence: (e: Evidence) => void;
  onImport: () => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const research = initialResearch(project);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);
  const [released, setReleased] = useState<ReleaseReason>();
  const [visibleTurns, setVisibleTurns] = useState(12);
  const searchAbort = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const running = useRef(false);
  const alive = useRef(true);
  const end = useRef<HTMLDivElement>(null);
  const state = useRef(research);
  state.current = research;
  const patch = (changes: Partial<ResearchState>) =>
    onChange({ ...state.current, ...changes });
  useEffect(() => {
    alive.current = true;
    setSupported(!!(navigator as Navigator & { gpu?: unknown }).gpu);
    const unsubscribe = subscribeModel(({ phase, reason }) => {
      setReady(phase === "ready" || phase === "running");
      setLoading(phase === "loading");
      setReleased(reason);
    });
    return () => {
      alive.current = false;
      sequence.current++;
      searchAbort.current?.abort();
      unsubscribe();
      unloadModel("navigation");
    };
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "instant" });
  }, [research.turns.length]);
  const selected = research.selectedSourceIds.filter((id) =>
    project.sources.some((s) => s.id === id),
  );
  const enable = async () => {
    const request = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      setProgress(0);
      await loadModel((p) => {
        if (alive.current && sequence.current === request) setProgress(p * 100);
      });
    } catch (e) {
      if (alive.current && sequence.current === request)
        setError(errorMessage(e, language));
    }
  };
  const ask = async () => {
    const question = research.question.trim();
    if (!question || !selected.length || busy) return;
    const request = ++sequence.current;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setBusy(true);
    running.current = true;
    setError("");
    try {
      const previous = research.followUp
        ? research.turns.at(-1)?.retrievalQuery
        : undefined;
      const output =
        research.mode === "answer"
          ? await generateAnswer(
              project,
              question,
              selected,
              language,
              previous,
              controller.signal,
            )
          : await findPassagesAsync(
              project,
              question,
              selected,
              previous,
              controller.signal,
            );
      if (alive.current && sequence.current === request)
        patch({
          turns: [...state.current.turns, output],
          question: "",
          followUp: true,
        });
    } catch (e) {
      if (alive.current && sequence.current === request)
        setError(errorMessage(e, language));
    } finally {
      if (alive.current && sequence.current === request) {
        setBusy(false);
        running.current = false;
      }
    }
  };
  const cancel = () => {
    sequence.current++;
    searchAbort.current?.abort();
    unloadModel();
    running.current = false;
    setBusy(false);
    setError("");
  };
  return (
    <section className="research-desk">
      <header className="research-header">
        <div>
          <span className="overline">{t("研究工作区", "RESEARCH DESK")}</span>
          <h1>{t("从资料中找到答案", "Ask your sources")}</h1>
        </div>
        <span className="research-local">
          <ShieldCheck size={14} />
          {t("保存在本机", "Saved on this device")}
        </span>
      </header>
      <div className="research-controls">
        <details className="scope-picker">
          <summary>
            <BookOpen size={16} />
            {t(
              `使用 ${selected.length} / ${project.sources.length} 份资料`,
              `${selected.length} of ${project.sources.length} sources`,
            )}
            <ChevronDown size={14} />
          </summary>
          <div className="scope-content">
            <div className="scope-actions">
              <button
                onClick={() =>
                  patch({ selectedSourceIds: project.sources.map((s) => s.id) })
                }
              >
                {t("全选", "Select all")}
              </button>
              <button onClick={() => patch({ selectedSourceIds: [] })}>
                {t("清空", "Clear")}
              </button>
              <button onClick={onImport}>
                <Plus size={13} />
                {t("添加资料", "Add source")}
              </button>
            </div>
            {project.sources.map((s) => (
              <label key={s.id}>
                <Checkbox
                  checked={selected.includes(s.id)}
                  disabled={busy}
                  onCheckedChange={(checked) =>
                    patch({
                      selectedSourceIds: checked
                        ? [...selected, s.id]
                        : selected.filter((id) => id !== s.id),
                    })
                  }
                />
                <span>{s.name}</span>
                <small>v{s.versions.length}</small>
              </label>
            ))}
          </div>
        </details>
        <div
          className="research-modes"
          role="group"
          aria-label={t("回答模式", "Response mode")}
        >
          <button
            aria-pressed={research.mode === "passages"}
            disabled={busy}
            onClick={() => {
              cancel();
              patch({ mode: "passages" });
            }}
          >
            <BookOpen size={14} />
            {t("查找原文", "Find passages")}
          </button>
          <button
            aria-pressed={research.mode === "answer"}
            disabled={busy}
            onClick={() => patch({ mode: "answer" })}
          >
            <Sparkles size={14} />
            {t("AI 回答", "AI answer")}
          </button>
        </div>
      </div>
      {research.mode === "answer" && !ready && (
        <div className="research-model">
          <div>
            <strong>{t("在你的设备上回答", "Answers on your device")}</strong>
            <p>
              {supported
                ? t(
                    "首次需要下载较大的模型文件，并占用设备内存和存储空间。资料不会上传；准备时间取决于设备与网络。",
                    "First use downloads large model files and uses device memory and storage. Sources stay local; setup time depends on your device and connection.",
                  )
                : t(
                    "此浏览器不支持 WebGPU。可以使用查找原文，或换用支持 WebGPU 的浏览器。",
                    "This browser does not support WebGPU. Use Find passages or a WebGPU-enabled browser.",
                  )}
            </p>
          </div>
          {loading ? (
            <div role="status">
              <Loader2 size={17} className="spin" />
              <span>{Math.round(progress)}%</span>
              <Progress value={progress} />
              <button className="text-action" onClick={cancel}>
                {t("取消加载", "Cancel setup")}
              </button>
            </div>
          ) : (
            <button
              className="secondary-button"
              disabled={!supported}
              onClick={enable}
            >
              {t("下载并启用", "Download & enable")}
            </button>
          )}
        </div>
      )}
      {ready && (
        <div className="model-session-bar">
          <span>
            {t(
              "离开页面或闲置 2 分钟后自动释放 AI；已下载文件保留。",
              "AI releases when you leave or after 2 minutes idle. Downloaded files stay cached.",
            )}
          </span>
          <button className="text-action" onClick={cancel}>
            {t("关闭 AI", "Turn off AI")}
          </button>
        </div>
      )}
      {!ready &&
        released &&
        ["idle", "hidden", "user"].includes(released) &&
        research.mode === "answer" && (
          <p className="model-release-note" role="status">
            {t(
              "AI 已关闭并释放运行资源，问题和记录仍然保留。",
              "AI is off and its worker has been released. Your question and history are retained.",
            )}
          </p>
        )}
      <div
        className="research-thread"
        aria-label={t("问答记录", "Research history")}
      >
        {!research.turns.length && (
          <div className="research-empty">
            <span>
              <BookOpen size={30} strokeWidth={1.3} />
            </span>
            <h2>
              {t("每个答案，都有来处", "A question. A trail of evidence.")}
            </h2>
            <p>
              {project.sources.length
                ? t(
                    "选择资料，提出问题。先查看原文，也可以让本地 AI 帮你整理。",
                    "Choose your sources and ask a question. Read the passages directly, or let local AI help connect them.",
                  )
                : t(
                    "添加一份 PDF、笔记或文章，即可开始核对和写作。",
                    "Add a PDF, note, or article to begin reading and writing with evidence.",
                  )}
            </p>
            {project.sources.length ? (
              <div className="research-starters">
                {[
                  ["概括资料中的主要观点", "Summarize the main ideas"],
                  [
                    "资料提到了哪些风险？",
                    "What risks do the sources mention?",
                  ],
                ].map(([zh, en]) => (
                  <button
                    key={en}
                    onClick={() => patch({ question: t(zh, en) })}
                  >
                    {t(zh, en)}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            ) : (
              <button className="primary-button" onClick={onImport}>
                <Plus size={16} />
                {t("添加第一份资料", "Add your first source")}
              </button>
            )}
          </div>
        )}
        {research.turns.length > visibleTurns && (
          <button
            className="history-more text-action"
            onClick={() => setVisibleTurns((n) => n + 12)}
          >
            {t("显示更早的记录", "Show earlier questions")} ·{" "}
            {research.turns.length - visibleTurns}
          </button>
        )}
        {research.turns.slice(-visibleTurns).map((turn) => (
          <AnswerCard
            key={turn.id}
            turn={turn}
            project={project}
            language={language}
            onEvidence={onEvidence}
            onAdopt={onAdopt}
            onKeep={onKeep}
            onReview={(ids) =>
              patch({
                turns: state.current.turns.map((current) =>
                  current.id === turn.id
                    ? { ...current, reviewedEvidenceIds: ids }
                    : current,
                ),
              })
            }
          />
        ))}
        {busy && (
          <div className="research-generating" role="status">
            <Loader2 size={17} className="spin" />
            {t("正在整理证据…", "Working through the evidence…")}
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="research-composer">
        {!selected.length && project.sources.length > 0 && (
          <p className="inline-error">
            {t(
              "先在上方选择至少一份资料。",
              "Select at least one source above to begin.",
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        {research.turns.length > 0 && (
          <label className="followup-option">
            <Checkbox
              checked={!!research.followUp}
              disabled={busy}
              onCheckedChange={(checked) => patch({ followUp: !!checked })}
            />
            {t(
              "追问时沿用上一问题的语境",
              "Use the previous question for follow-ups",
            )}
          </label>
        )}
        <div className="question-input">
          <textarea
            aria-label={t("研究问题", "Research question")}
            placeholder={t(
              "你想从这些资料里了解什么？",
              "What would you like to understand?",
            )}
            value={research.question}
            maxLength={1200}
            rows={2}
            disabled={busy}
            onChange={(e) => patch({ question: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void ask();
              }
            }}
          />
          {busy ? (
            <button
              aria-label={t("停止回答", "Stop answering")}
              onClick={cancel}
            >
              <Square size={17} />
            </button>
          ) : (
            <button
              aria-label={t("提交问题", "Ask question")}
              disabled={
                !research.question.trim() ||
                !selected.length ||
                (research.mode === "answer" && !ready)
              }
              onClick={ask}
            >
              <ArrowUp size={20} />
            </button>
          )}
        </div>
        <div className="composer-caption">
          <span>
            {research.mode === "passages"
              ? t("原文查找 · 无需模型", "Passage search · No model needed")
              : t("本地 AI · 核对后使用", "Local AI · Review before use")}
          </span>
          <span>Ctrl / ⌘ + Enter</span>
        </div>
      </div>
    </section>
  );
}
