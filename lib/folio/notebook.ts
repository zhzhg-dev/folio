import {
  uid,
  heading,
  para,
  makeProject,
  type Notebook,
  type Finding,
  type Project,
  type Language,
  type Draft,
} from "./model.ts";
import {
  cellStatus,
  validComparison,
  comparisonExample,
} from "./comparison.ts";
import { draftNodes, evidenceExists } from "./research.ts";

export const notebookLimits = { questions: 30, findings: 200 };
export function emptyNotebook(): Notebook {
  return { objective: "", questions: [], findings: [] };
}
export function freshWorkspace() {
  const project = makeProject("Untitled research", "en");
  project.notebook = emptyNotebook();
  project.lastView = "findings";
  return {
    schemaVersion: 1 as const,
    projects: [project],
    activeId: project.id,
    language: "en" as const,
    languagePreferenceVersion: 1 as const,
  };
}
// Existing comparisons can be explored as research without rewriting their data.
// The notebook becomes an independent snapshot only when the user edits it.
export function notebookFor(project: Project): Notebook {
  if (project.notebook) return project.notebook;
  const c = project.comparison;
  if (!c) return emptyNotebook();
  return {
    objective: c.objective,
    questions: c.criteria.map((r) => ({ id: r.id, title: r.name })),
    findings: c.cells
      .filter((cell) => cell.value.trim())
      .map((cell) => ({
        id: JSON.stringify([cell.optionId, cell.criterionId]),
        questionId: cell.criterionId,
        value: cell.value,
        kind: cell.kind,
        evidence: cell.evidence,
        note: "",
        reviewedAt: cell.reviewedAt,
      })),
  };
}
export function notebookExample(language: Language): Project {
  const p = comparisonExample(language);
  const zh = language === "zh";
  const questions = (
    zh
      ? ["哪款工具符合预算？", "能否完整导出数据？", "切换工具有哪些限制？"]
      : [
          "Which tool fits our budget?",
          "Can we take our data with us?",
          "What could make switching difficult?",
        ]
  ).map((title) => ({ id: uid(), title }));
  const evidence = (index: number, line: number) => {
    const source = p.sources[index];
    const version = source.versions.at(-1)!;
    return {
      id: uid(),
      sourceId: source.id,
      versionId: version.id,
      page: 1,
      quote: version.text.split("\n\n")[line + 1],
      name: source.name,
      label: String(index + 1),
    };
  };
  const finding = (
    question: number,
    value: string,
    quote: ReturnType<typeof evidence> | null,
    note = "",
  ): Finding => ({
    id: uid(),
    questionId: questions[question].id,
    value,
    kind: quote ? "judgment" : "unknown",
    evidence: quote ? [quote] : [],
    note,
  });
  p.notebook = {
    objective: zh
      ? "五人团队 · 每月低于 100 美元 · 需要共享收件箱"
      : "Five people · Under $100/month · Shared inbox required",
    questions,
    findings: [
      finding(
        0,
        zh
          ? "Harbor 年付方案符合预算。五席位相当于每月 90 美元。"
          : "Harbor fits on an annual plan. Five seats cost $90/month equivalent.",
        evidence(0, 0),
        zh
          ? "18 美元 × 5 席位；年付总额为 1,080 美元。付款前确认合同条件。"
          : "$18 × 5 seats. The annual commitment is $1,080. Confirm the billing terms before committing.",
      ),
      finding(
        0,
        zh
          ? "Relay 超出预算。五席位每月需 120 美元。"
          : "Relay exceeds the budget. Five seats total $120/month.",
        evidence(1, 0),
      ),
      finding(
        0,
        zh
          ? "Plainbox 价格较低，但导出能力仍不明确。"
          : "Plainbox costs less, but its export support is still unclear.",
        null,
        zh
          ? "不能仅凭价格做决定，先补充数据导出说明。"
          : "Ask for export documentation before deciding on price alone.",
      ),
      finding(
        1,
        zh
          ? "Harbor 声明支持 CSV 导出，但完整性仍需试用确认。"
          : "Harbor lists CSV export; completeness still needs a trial.",
        evidence(0, 1),
      ),
      finding(
        1,
        zh ? "Relay 也声明支持 CSV 导出。" : "Relay also lists CSV export.",
        evidence(1, 1),
      ),
      finding(
        2,
        zh
          ? "Harbor 的基础支持渠道不包含在线聊天。"
          : "Harbor does not include live chat.",
        evidence(0, 2),
      ),
    ],
  };
  p.lastView = "findings";
  return p;
}
export function findingStatus(finding: Finding, project: Project) {
  return cellStatus(
    { ...finding, optionId: "finding", criterionId: finding.questionId },
    project,
  );
}
export function editFinding(
  finding: Finding,
  patch: Partial<Pick<Finding, "value" | "kind" | "evidence" | "note">>,
): Finding {
  return { ...finding, ...patch, reviewedAt: undefined };
}
export function findingNodes(
  finding: Finding,
  project: Project,
  language: Language,
) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  if (
    !finding.value.trim() ||
    finding.evidence.some((e) => !evidenceExists(e, project))
  )
    throw new Error("无法核对引用原文 / Could not verify the cited passage.");
  const status = findingStatus(finding, project);
  const labels = {
    reviewed: t("已人工核对", "Manually reviewed"),
    unreviewed: t("未核对", "Not reviewed"),
    changed: t("来源已更新，待复核", "Source updated · review needed"),
    missing: t("待补充证据", "Needs evidence"),
  };
  const question = notebookFor(project).questions.find(
    (q) => q.id === finding.questionId,
  );
  return [
    heading(question?.title || t("研究发现", "Research finding")),
    ...(finding.evidence.length
      ? draftNodes(
          {
            paragraphs: [
              {
                text: finding.value,
                evidenceIds: finding.evidence.map((e) => e.id),
              },
            ],
            evidence: finding.evidence,
          },
          project,
        )
      : [para(finding.value)]),
    para(
      `${t("状态：", "Status: ")}${labels[status]} · ${finding.kind === "judgment" ? t("个人判断", "Personal judgment") : finding.kind === "fact" ? t("事实记录", "Recorded fact") : t("待确认", "To confirm")}`,
    ),
    ...(finding.note.trim()
      ? [para(t("我的备注：", "Your note: ") + finding.note)]
      : []),
  ];
}
export function findingsFromDraft(draft: Draft, questionId: string): Finding[] {
  return draft.paragraphs.map((p) => ({
    id: uid(),
    questionId,
    value: p.text,
    kind: "fact",
    note: "",
    evidence: draft.evidence.filter((e) => p.evidenceIds.includes(e.id)),
  }));
}
export function validNotebook(value: unknown): value is Notebook {
  if (!value || typeof value !== "object") return false;
  const n = value as Notebook;
  const str = (v: unknown, max: number): v is string =>
    typeof v === "string" && v.length <= max;
  if (
    !str(n.objective, 10000) ||
    !Array.isArray(n.questions) ||
    n.questions.length > notebookLimits.questions ||
    !Array.isArray(n.findings) ||
    n.findings.length > notebookLimits.findings
  )
    return false;
  if (
    !n.questions.every(
      (q) => q && str(q.id, 200) && q.id && str(q.title, 200) && q.title.trim(),
    ) ||
    new Set(n.questions.map((q) => q.id)).size !== n.questions.length
  )
    return false;
  if (new Set(n.findings.map((f) => f?.id)).size !== n.findings.length)
    return false;
  if (n.archived !== undefined) {
    if (
      !Array.isArray(n.archived) ||
      n.archived.length > 200 ||
      n.archived.reduce(
        (sum, entry) =>
          sum + (Array.isArray(entry?.findings) ? entry.findings.length : 201),
        0,
      ) > 200
    )
      return false;
    if (
      !n.archived.every(
        (entry) =>
          entry &&
          str(entry.id, 200) &&
          entry.id &&
          ["question", "finding"].includes(entry.kind) &&
          str(entry.archivedAt, 100) &&
          Number.isFinite(Date.parse(entry.archivedAt)) &&
          entry.question &&
          Array.isArray(entry.findings) &&
          (entry.kind !== "finding" || entry.findings.length === 1) &&
          validNotebook({
            objective: "",
            questions: [entry.question],
            findings: entry.findings,
          }),
      )
    )
      return false;
    const ids = [
      ...n.findings,
      ...n.archived.flatMap((entry) => entry.findings),
    ].map((f) => f?.id);
    const questions = [
      ...n.questions,
      ...n.archived
        .filter((entry) => entry.kind === "question")
        .map((entry) => entry.question),
    ].map((q) => q.id);
    if (
      new Set(ids).size !== ids.length ||
      new Set(questions).size !== questions.length ||
      new Set(n.archived.map((entry) => entry.id)).size !== n.archived.length
    )
      return false;
  }
  return n.findings.every(
    (f) =>
      f &&
      str(f.id, 500) &&
      f.id &&
      str(f.note, 10000) &&
      n.questions.some((q) => q.id === f.questionId) &&
      validComparison({
        objective: "",
        constraints: "",
        recommendation: "",
        limitations: "",
        options: [{ id: "f", name: "", sourceIds: [] }],
        criteria: [{ id: f.questionId, name: "" }],
        cells: [{ ...f, optionId: "f", criterionId: f.questionId }],
      }),
  );
}
