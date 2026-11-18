"use client";

import { useId, useMemo } from "react";
import { Check, CircleDot, ChevronDown } from "lucide-react";
import {
  decisionProgress,
  type DecisionAction,
  type DecisionProgressState,
} from "@/lib/folio/decision-progress";
import type { Language, Project } from "@/lib/folio/model";
import "@/app/decision-progress.css";

type Copy = [zh: string, en: string];
const states: Record<
  DecisionProgressState,
  { heading: Copy; reason: Copy; action: Copy }
> = {
  capacity: {
    heading: ["为下一条发现留出空间", "Make room for the next finding"],
    reason: [
      "研究问题或活跃发现已到上限。先整理并归档不再需要的内容，再继续填写这项比较。",
      "The project has reached its question or active finding limit. Organize and archive unneeded research before filling this entry.",
    ],
    action: ["整理研究", "Organize research"],
  },
  "existing-brief": {
    heading: ["检查已有简报", "Review your existing brief"],
    reason: [
      "简报中已有正文。你可以保留自己的写法；需要关联比较时，再明确选择“写入研究简报”。",
      "Your brief already has content. Keep your own writing, or explicitly add a linked comparison using “Build decision brief”.",
    ],
    action: ["打开简报", "Open brief"],
  },
  materials: {
    heading: ["为方案补充资料", "Give the comparison a source"],
    reason: [
      "添加资料或把已有资料关联到方案，便于核对尚未填写的比较项。",
      "Add a source, or connect one you already have, to fill the remaining entries.",
    ],
    action: ["添加资料", "Add sources"],
  },
  "restore-finding": {
    heading: ["恢复关联发现", "Restore a linked finding"],
    reason: [
      "此比较项关联的发现已归档。恢复后可以继续编辑和核对。",
      "The finding behind this entry is archived. Restore it to keep editing and reviewing.",
    ],
    action: ["恢复发现", "Restore finding"],
  },
  "restore-question": {
    heading: ["恢复对应研究问题", "Restore this research question"],
    reason: [
      "这个比较维度对应的研究问题已归档。先恢复问题，再为它保存新的比较发现。",
      "The research question for this criterion is archived. Restore it before saving another comparison finding under it.",
    ],
    action: ["恢复问题", "Restore question"],
  },
  changed: {
    heading: ["重看已变化的证据", "Revisit changed evidence"],
    reason: [
      "资料有新版本，或已有引用无法在原页核实。请重新核对原文与判断。",
      "A source has a newer version, or a passage can no longer be verified. Check the source and your conclusion again.",
    ],
    action: ["重新核对", "Recheck entry"],
  },
  "fill-gap": {
    heading: ["补齐一项比较", "Fill one comparison gap"],
    reason: [
      "为此项补充证据，或明确说明还有什么不知道。",
      "Record a finding with its evidence, or state what is still unknown.",
    ],
    action: ["打开比较项", "Open entry"],
  },
  review: {
    heading: ["核对下一条发现", "Review the next finding"],
    reason: [
      "确认原文支持这条记录。如果是个人判断，核对它的依据和取舍。",
      "Check the source for a fact, or confirm the reasoning behind a judgment.",
    ],
    action: ["核对比较项", "Review entry"],
  },
  limitations: {
    heading: ["交代仍待确认的事项", "State what remains unknown"],
    reason: [
      "比较表已有明确记录的未知项。把它们对决策的影响写入限制。",
      "The table records some unknowns. Explain how they limit the decision.",
    ],
    action: ["填写限制", "Write limitations"],
  },
  recommendation: {
    heading: ["写下建议与理由", "Write your recommendation"],
    reason: [
      "说明你倾向哪个方案，以及哪些证据、取舍或条件影响了判断。",
      "Explain your choice and the evidence, trade-offs, or conditions behind it.",
    ],
    action: ["填写建议", "Write recommendation"],
  },
  draft: {
    heading: ["把比较写入简报", "Bring the comparison into the brief"],
    reason: [
      "插入含比较结果、建议和引用的关联段落。后续更新由你确认。",
      "Insert the comparison, recommendation, and citations as a linked section. You control later updates.",
    ],
    action: ["写入简报", "Insert decision brief"],
  },
  "brief-update": {
    heading: ["检查简报中的关联内容", "Review a linked brief section"],
    reason: [
      "有变化或不可用的关联。请在交付前核对，当前正文会保留。",
      "A linked section changed or lost its source. Review it before delivery; your writing stays in place.",
    ],
    action: ["检查简报", "Review section"],
  },
  "brief-citations": {
    heading: ["复核简报引用", "Check the brief’s citations"],
    reason: [
      "简报中有引用指向旧版资料或无法核实。",
      "Some citations point to older material or can no longer be verified.",
    ],
    action: ["查看引用复核", "Review citations"],
  },
  "first-edition": {
    heading: ["准备首份交付版本", "Prepare the first edition"],
    reason: [
      "预览接收者看到的简报及引用，再保存为固定版本。",
      "Preview the brief and citations as recipients will see them, then save a fixed edition.",
    ],
    action: ["准备交付", "Prepare edition"],
  },
  "next-edition": {
    heading: ["当前简报需要新的交付版本", "Prepare an edition for this draft"],
    reason: [
      "保存的版本与当前正文或引用不一致。新版本不会改动以前的交付。",
      "The saved editions don’t match this draft and its citations. A new edition leaves earlier ones intact.",
    ],
    action: ["准备新版本", "Prepare new edition"],
  },
  "saved-edition": {
    heading: ["已有版本与当前简报一致", "A saved edition matches this draft"],
    reason: [
      "已保存版本的正文和引用与当前简报一致，可打开查看或导出。",
      "The saved content and citations match this draft. Open the edition to view or export it.",
    ],
    action: ["查看已保存版本", "Open saved edition"],
  },
};

export default function DecisionProgress({
  project,
  language,
  onAction,
}: {
  project: Project;
  language: Language;
  onAction: (action: DecisionAction) => void;
}) {
  const heading = useId();
  const progress = useMemo(() => decisionProgress(project), [project]);
  if (!progress) return null;
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const copy = states[progress.state];
  const complete = progress.state === "saved-edition";
  const { counts, notedGaps, target, action } = progress;
  const actionLabel =
    action.type === "attach"
      ? t("关联资料", "Connect source")
      : t(...copy.action);
  const reason =
    action.type === "attach"
      ? t(
          "这个方案还有待填写的比较项。先为它关联一份当前资料。",
          "This option has open entries. Connect it to a source already in the project.",
        )
      : t(...copy.reason);
  return (
    <section
      className="decision-progress"
      data-state={progress.state}
      aria-labelledby={heading}
    >
      <details>
        <summary
          className="decision-progress-summary"
          title={t("查看此步骤的原因", "See why this step is next")}
        >
          <span className="decision-progress-marker" aria-hidden="true">
            {complete ? <Check size={15} /> : <CircleDot size={15} />}
          </span>
          <span className="decision-progress-heading">
            <span className="decision-progress-label">
              {complete
                ? t("交付进度", "Edition status")
                : t("建议下一步", "Suggested next step")}
            </span>
            <strong id={heading}>{t(...copy.heading)}</strong>
          </span>
          <ChevronDown
            className="decision-progress-chevron"
            size={14}
            aria-hidden="true"
          />
        </summary>
        <div className="decision-progress-reason">
          {target && <p className="decision-progress-target">{target}</p>}
          <p>{reason}</p>
          <p className="decision-progress-counts">
            <span>
              {t(
                `${counts.reviewed}/${counts.total} 项已人工核对`,
                `${counts.reviewed}/${counts.total} manually reviewed`,
              )}
            </span>
            {notedGaps > 0 && (
              <span>
                {t(
                  `${notedGaps} 项明确待确认`,
                  `${notedGaps} documented ${notedGaps === 1 ? "unknown" : "unknowns"}`,
                )}
              </span>
            )}
            {counts.changed > 0 && (
              <span>
                {t(
                  `${counts.changed} 项证据待复核`,
                  `${counts.changed} to recheck`,
                )}
              </span>
            )}
          </p>
        </div>
      </details>
      <button
        type="button"
        className="decision-progress-action"
        onClick={() => onAction(action)}
      >
        {actionLabel}
      </button>
    </section>
  );
}
