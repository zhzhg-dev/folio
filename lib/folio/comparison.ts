import {
  uid,
  heading,
  para,
  textNode,
  makeProject,
  type Comparison,
  type ComparisonCell,
  type Project,
  type Language,
  type Evidence,
} from "./model.ts";
import { evidenceExists } from "./research.ts";
import type { JSONContent } from "@tiptap/react";

export const comparisonLimits = { options: 6, criteria: 12, evidence: 8 };
export function emptyComparison(language: Language): Comparison {
  return {
    objective: "",
    constraints: "",
    recommendation: "",
    limitations: "",
    options: [1, 2].map((i) => ({
      id: uid(),
      name: language === "zh" ? `方案 ${i}` : `Option ${i}`,
      sourceIds: [],
    })),
    criteria: (language === "zh"
      ? ["价格与计费", "核心需求", "限制条件"]
      : ["Pricing & billing", "Core requirements", "Limitations"]
    ).map((name) => ({ id: uid(), name })),
    cells: [],
  };
}
export function cellStatus(
  cell: ComparisonCell | undefined,
  project: Project,
): "missing" | "changed" | "unreviewed" | "reviewed" {
  if (!cell || !cell.value.trim() || cell.kind === "unknown") return "missing";
  if (
    cell.evidence.some(
      (e) =>
        !evidenceExists(e, project) ||
        project.sources.find((s) => s.id === e.sourceId)?.versions.at(-1)
          ?.id !== e.versionId,
    )
  )
    return "changed";
  if (cell.kind === "fact" && !cell.evidence.length) return "missing";
  return cell.reviewedAt ? "reviewed" : "unreviewed";
}
export function comparisonProgress(project: Project) {
  const comparison = project.comparison;
  const counts = {
    total: 0,
    reviewed: 0,
    missing: 0,
    changed: 0,
    unreviewed: 0,
  };
  if (!comparison) return counts;
  for (const option of comparison.options)
    for (const criterion of comparison.criteria) {
      const cell = comparison.cells.find(
        (c) => c.optionId === option.id && c.criterionId === criterion.id,
      );
      counts.total++;
      counts[cellStatus(cell, project)]++;
    }
  return counts;
}
export function validComparison(value: unknown): value is Comparison {
  if (!value || typeof value !== "object") return false;
  const c = value as Comparison;
  const str = (v: unknown, n = 10000): v is string =>
    typeof v === "string" && v.length <= n;
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (
    ![c.objective, c.constraints, c.recommendation, c.limitations].every((v) =>
      str(v),
    ) ||
    !Array.isArray(c.options) ||
    c.options.length < 1 ||
    c.options.length > comparisonLimits.options ||
    !c.options.every(
      (o) =>
        o &&
        str(o.id, 200) &&
        !!o.id &&
        str(o.name, 200) &&
        Array.isArray(o.sourceIds) &&
        o.sourceIds.length <= 20 &&
        o.sourceIds.every((s) => str(s, 200)),
    ) ||
    !unique(c.options.map((o) => o.id)) ||
    !Array.isArray(c.criteria) ||
    c.criteria.length < 1 ||
    c.criteria.length > comparisonLimits.criteria ||
    !c.criteria.every(
      (r) =>
        r &&
        str(r.id, 200) &&
        !!r.id &&
        str(r.name, 200) &&
        (r.query === undefined || str(r.query, 500)),
    ) ||
    !unique(c.criteria.map((r) => r.id)) ||
    !Array.isArray(c.cells) ||
    c.cells.length > comparisonLimits.options * comparisonLimits.criteria
  )
    return false;
  return (
    unique(c.cells.map((x) => JSON.stringify([x?.optionId, x?.criterionId]))) &&
    c.cells.every(
      (x) =>
        x &&
        c.options.some((o) => o.id === x.optionId) &&
        c.criteria.some((r) => r.id === x.criterionId) &&
        str(x.value) &&
        ["fact", "judgment", "unknown"].includes(x.kind) &&
        (x.reviewedAt === undefined ||
          (str(x.reviewedAt, 100) &&
            Number.isFinite(Date.parse(x.reviewedAt)))) &&
        Array.isArray(x.evidence) &&
        x.evidence.length <= comparisonLimits.evidence &&
        x.evidence.every(
          (e) =>
            e &&
            [e.id, e.sourceId, e.versionId, e.name, e.label].every((v) =>
              str(v, 1000),
            ) &&
            str(e.quote) &&
            !!e.quote.trim() &&
            Number.isInteger(e.page) &&
            e.page > 0,
        ),
    )
  );
}
export function comparisonBrief(
  project: Project,
  language: Language,
): JSONContent[] {
  const c = project.comparison;
  if (!c || !validComparison(c))
    throw new Error("比较内容无效 / Invalid comparison");
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const counts = comparisonProgress(project);
  const nodes: JSONContent[] = [
    heading(t("方案比较简报", "Decision brief")),
    para(
      c.objective || t("研究目标待补充。", "Research objective not specified."),
    ),
    para(
      t("约束条件：", "Constraints: ") +
        (c.constraints || t("未填写", "Not specified")),
    ),
    para(
      t("核对进度：", "Review progress: ") +
        `${counts.reviewed}/${counts.total}. ` +
        t(
          "这是当前比较的快照；个人判断未经自动验证。",
          "This is a snapshot of the comparison. Personal judgments are not automatically verified.",
        ),
    ),
    heading(t("建议与理由", "Recommendation & reasoning")),
    para(
      c.recommendation || t("尚未形成建议。", "No recommendation recorded."),
    ),
    heading(t("逐项比较", "Comparison")),
  ];
  const tableCell = (content: JSONContent[], header = false): JSONContent => ({
    type: header ? "tableHeader" : "tableCell",
    content,
  });
  nodes.push({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          tableCell([para(t("比较维度", "Criterion"))], true),
          ...c.options.map((o) => tableCell([para(o.name)], true)),
        ],
      },
      ...c.criteria.map((r) => ({
        type: "tableRow",
        content: [
          tableCell([para(r.name)], true),
          ...c.options.map((o) => {
            const cell = c.cells.find(
              (x) => x.optionId === o.id && x.criterionId === r.id,
            );
            const status = cellStatus(cell, project);
            const statusText = {
              missing: t("待确认", "To confirm"),
              changed: t("来源变化，请复核", "Source changed — review needed"),
              unreviewed: t("未核对", "Not reviewed"),
              reviewed: t("已人工核对", "Manually reviewed"),
            }[status];
            const kind =
              cell?.kind === "judgment"
                ? t("个人判断", "Personal judgment")
                : cell?.kind === "fact"
                  ? t("事实记录", "Recorded fact")
                  : t("待确认", "To confirm");
            const evidence = (cell?.evidence || []).filter((e) =>
              evidenceExists(e, project),
            );
            return tableCell([
              para(kind === statusText ? kind : `${kind} · ${statusText}`),
              {
                type: "paragraph",
                content: [
                  textNode(
                    cell?.value || t("缺少信息", "No information recorded"),
                  ),
                  ...evidence.map((e) => ({
                    type: "citation",
                    attrs: {
                      sourceId: e.sourceId,
                      versionId: e.versionId,
                      page: e.page,
                      quote: e.quote,
                      label: String(
                        project.sources.findIndex((s) => s.id === e.sourceId) +
                          1,
                      ),
                    },
                  })),
                ],
              },
            ]);
          }),
        ],
      })),
    ],
  });
  nodes.push(
    heading(t("限制与待确认事项", "Limitations & open questions")),
    para(
      c.limitations ||
        t("未记录其他限制。", "No additional limitations recorded."),
    ),
  );
  for (const r of c.criteria)
    for (const o of c.options) {
      const cell = c.cells.find(
        (x) => x.optionId === o.id && x.criterionId === r.id,
      );
      if (cellStatus(cell, project) !== "reviewed")
        nodes.push(
          para(
            `${o.name} / ${r.name}: ${cellStatus(cell, project) === "changed" ? t("来源已更新，需要重新核对。", "Source updated; review again.") : t("需要确认或人工核对。", "Confirmation or manual review needed.")}`,
          ),
        );
    }
  return nodes;
}

export function comparisonExample(language: Language): Project {
  const zh = language === "zh";
  const p = makeProject(
    zh ? "客服软件选型 · 示例" : "Support software · sample",
    language,
  );
  p.example = true;
  p.lastView = "comparison";
  p.description = zh
    ? "虚构资料，用于演示比较、证据核对与来源更新。"
    : "Fictional materials demonstrating comparisons, evidence review and source updates.";
  p.reportTitle = zh
    ? "五人团队的客服软件选型"
    : "Choosing support software for a team of five";
  const names = ["Harbor", "Relay", "Plainbox"];
  const lines = [
    [
      "Harbor costs USD 15 per agent per month, billed annually.",
      "Harbor includes a shared inbox and CSV export.",
      "Harbor supports email only. Live chat is not included.",
    ],
    [
      "Relay costs USD 24 per agent per month, billed monthly.",
      "Relay includes a shared inbox, live chat and CSV export.",
      "Relay provides English support. Chinese support is not documented.",
    ],
    [
      "Plainbox costs USD 10 per agent per month, billed annually.",
      "Plainbox includes a shared inbox and email support.",
    ],
  ];
  p.sources = names.map((name, i) => {
    const text = `Fictional product specification for the Folio sample.\n\n${lines[i].join("\n\n")}`;
    const sourceId = uid();
    return {
      id: sourceId,
      name: `${name} — sample specification`,
      kind: "txt",
      color: ["clay", "blue", "green"][i],
      versions: [
        {
          id: uid(),
          text,
          pages: [{ page: 1, text }],
          createdAt: p.createdAt,
          hash: `sample-${i}`,
          size: text.length,
        },
      ],
    } as Project["sources"][number];
  });
  const c = emptyComparison(language);
  c.objective = zh
    ? "为五人客服团队选择软件：需要共享收件箱、数据导出，预算每月 100 美元以内。"
    : "Choose support software for five agents: shared inbox, data export, and a budget below USD 100 per month.";
  c.constraints = zh
    ? "比较年付承诺和月付灵活性；缺失的信息需要向供应商确认。"
    : "Compare annual commitment with monthly flexibility. Confirm undocumented features with the vendor.";
  c.options = names.map((name, i) => ({
    id: uid(),
    name,
    sourceIds: [p.sources[i].id],
  }));
  c.criteria = (
    zh
      ? ["每席位价格", "收件箱与导出", "渠道与支持"]
      : ["Price per agent", "Inbox & export", "Channels & support"]
  ).map((name) => ({ id: uid(), name }));
  c.cells = c.options.flatMap((o, i) =>
    c.criteria.map((r, j) => {
      const quote = lines[i][j];
      const source = p.sources[i];
      const evidence: Evidence[] = quote
        ? [
            {
              id: uid(),
              sourceId: source.id,
              versionId: source.versions[0].id,
              page: 1,
              quote,
              name: source.name,
              label: String(i + 1),
            },
          ]
        : [];
      return {
        optionId: o.id,
        criterionId: r.id,
        value: quote || "",
        kind: quote ? "fact" : "unknown",
        evidence,
      } as ComparisonCell;
    }),
  );
  // Preserve a genuine earlier version so the demo exercises update impact.
  const old = p.sources[0].versions[0];
  const newer = old.text.replace("USD 15", "USD 18");
  p.sources[0].versions.push({
    ...old,
    id: uid(),
    text: newer,
    pages: [{ page: 1, text: newer }],
    hash: "sample-0-updated",
    size: newer.length,
  });
  c.recommendation = zh
    ? "暂时优先考察 Harbor。更新后的单价为 18 美元，五席位月度等值费用为 90 美元，但需要年付。核对报价并试用后再决定。"
    : "Explore Harbor first. The revised price is USD 18 per agent: USD 90 per month equivalent for five agents, with annual billing. Verify the quote and complete a trial before deciding.";
  c.limitations = zh
    ? "以上产品和价格均为虚构。尚未试用；Plainbox 的导出能力与支持渠道待确认。"
    : "All products and prices are fictional. No trial has been completed. Plainbox export and support channels need confirmation.";
  p.comparison = c;
  return p;
}
