import type { JSONContent } from "@tiptap/react";
import { uid, plainText, type Project, type Language } from "./model.ts";
import {
  collectCitations,
  citationStatus,
  validateDocument,
} from "./integrity.ts";
import { findingNodes, notebookFor, findingStatus } from "./notebook.ts";

export const deliveryLimits = {
  count: 10,
  bytes: 1024 * 1024,
  totalBytes: 4 * 1024 * 1024,
};
export type DeliveryReference = {
  sourceId: string;
  versionId: string;
  page: number;
  quote: string;
  name: string;
  versionDate: string;
  status: ReturnType<typeof citationStatus>;
};
export type Delivery = {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  language: Language;
  origin: "brief" | "findings";
  content: JSONContent;
  references: DeliveryReference[];
  checks: { missing: number; updated: number; unreviewed: number };
};
export type DeliveryOptions = {
  title: string;
  summary: string;
  origin: Delivery["origin"];
  findingIds: string[];
  includeNotes: boolean;
};
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;
const refKey = (a: Record<string, unknown>) =>
  JSON.stringify([a.sourceId, a.versionId, a.page, a.quote]);

export function createDelivery(
  project: Project,
  language: Language,
  options: DeliveryOptions,
): Delivery {
  const notebook = notebookFor(project);
  const findings = notebook.findings.filter((f) =>
    options.findingIds.includes(f.id),
  );
  if (options.origin === "findings" && !findings.length)
    throw new Error("请先选择研究发现 / Select at least one finding.");
  // Missing evidence must be repaired, never silently removed from selected findings.
  const sourceContent =
    options.origin === "brief"
      ? project.content
      : {
          type: "doc",
          content: notebook.questions.flatMap((question) => {
            const group = findings.filter((f) => f.questionId === question.id);
            return group.flatMap((f, index) => {
              const nodes = findingNodes(
                { ...f, note: options.includeNotes ? f.note : "" },
                project,
                language,
              );
              return index === 0 ? nodes : nodes.slice(1);
            });
          }),
        };
  if (!plainText(sourceContent).trim())
    throw new Error("内容为空 / Add content before preparing a delivery.");
  if (!validateDocument(sourceContent))
    throw new Error("内容格式无效 / Invalid document.");
  const references: DeliveryReference[] = [];
  const keys: string[] = [];
  const clean = (node: JSONContent): JSONContent => {
    const copy: JSONContent = { type: node.type };
    if (node.text !== undefined) copy.text = node.text;
    if (node.marks)
      copy.marks = node.marks
        .filter((m) => ["bold", "italic", "strike", "code"].includes(m.type))
        .map((m) => ({ type: m.type }));
    if (node.type === "heading")
      copy.attrs = { level: headingLevel(node.attrs?.level) };
    if (node.type === "citation") {
      const a = node.attrs || {};
      const key = refKey(a);
      let index = keys.indexOf(key);
      if (index === -1) {
        const source = project.sources.find((s) => s.id === a.sourceId);
        const version = source?.versions.find((v) => v.id === a.versionId);
        index = keys.length;
        keys.push(key);
        references.push({
          sourceId: String(a.sourceId || ""),
          versionId: String(a.versionId || ""),
          page: Number.isSafeInteger(a.page) && a.page > 0 ? a.page : 0,
          quote: String(a.quote || ""),
          name:
            source?.name || (language === "zh" ? "来源缺失" : "Missing source"),
          versionDate: version?.createdAt || "",
          status: citationStatus(a, project),
        });
      }
      const r = references[index];
      copy.attrs = {
        sourceId: r.sourceId,
        versionId: r.versionId,
        page: r.page,
        quote: r.quote,
        label: String(index + 1),
      };
    }
    if (node.content) copy.content = node.content.map(clean);
    return copy;
  };
  const content = clean(sourceContent);
  const delivery: Delivery = {
    id: uid(),
    title: options.title.trim(),
    summary: options.summary.trim(),
    createdAt: new Date().toISOString(),
    language,
    origin: options.origin,
    content,
    references,
    checks: {
      missing: references.filter((r) => r.status === "missing").length,
      updated: references.filter(
        (r) => r.status === "older" || r.status === "changed",
      ).length,
      unreviewed:
        options.origin === "findings"
          ? findings.filter((f) => findingStatus(f, project) !== "reviewed")
              .length
          : 0,
    },
  };
  if (!validDelivery(delivery))
    throw new Error(
      "标题最多 200 字，简介最多 2,000 字；单份交付包最多 1 MB / Use a title up to 200 characters and a summary up to 2,000. Each delivery is limited to 1 MB.",
    );
  return delivery;
}
export function validDelivery(value: unknown): value is Delivery {
  if (!value || typeof value !== "object") return false;
  const d = value as Delivery;
  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.length <= max;
  if (
    !str(d.id, 200) ||
    !d.id ||
    !str(d.title, 200) ||
    !d.title.trim() ||
    !str(d.summary, 2000) ||
    !str(d.createdAt, 100) ||
    !Number.isFinite(Date.parse(d.createdAt)) ||
    !["en", "zh"].includes(d.language) ||
    !["brief", "findings"].includes(d.origin) ||
    !validateDocument(d.content) ||
    d.content.type !== "doc" ||
    !Array.isArray(d.references) ||
    d.references.length > 2000 ||
    !d.checks
  )
    return false;
  if (
    ![d.checks.missing, d.checks.updated, d.checks.unreviewed].every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n <= 2000,
    )
  )
    return false;
  if (
    !d.references.every(
      (r) =>
        r &&
        str(r.sourceId, 200) &&
        str(r.versionId, 200) &&
        str(r.name, 1000) &&
        str(r.quote, 100000) &&
        str(r.versionDate, 100) &&
        Number.isSafeInteger(r.page) &&
        r.page >= 0 &&
        ["current", "older", "changed", "missing"].includes(r.status),
    )
  )
    return false;
  if (
    d.checks.missing !==
      d.references.filter((r) => r.status === "missing").length ||
    d.checks.updated !==
      d.references.filter((r) => ["older", "changed"].includes(r.status)).length
  )
    return false;
  const cited = collectCitations(d.content);
  if (
    !cited.every((c) => {
      const i = Number(c.attrs?.label) - 1;
      const r = d.references[i];
      return Number.isInteger(i) && r && refKey(c.attrs || {}) === refKey(r);
    })
  )
    return false;
  if (
    d.references.some(
      (_, i) => !cited.some((c) => c.attrs?.label === String(i + 1)),
    )
  )
    return false;
  return bytes(d) <= deliveryLimits.bytes;
}
export function validDeliveries(value: unknown): value is Delivery[] {
  return (
    Array.isArray(value) &&
    value.length <= deliveryLimits.count &&
    value.every(validDelivery) &&
    new Set(value.map((d) => d.id)).size === value.length &&
    bytes(value) <= deliveryLimits.totalBytes
  );
}
export function headingLevel(value: unknown) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 6
    ? value
    : 2;
}
export const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
export function deliveryHtml(d: Delivery) {
  const zh = d.language === "zh";
  const t = (cn: string, en: string) => (zh ? cn : en);
  const render = (node: JSONContent): string => {
    if (node.text !== undefined)
      return (node.marks || []).reduce((s, mark) => {
        const tag = (
          { bold: "strong", italic: "em", strike: "s", code: "code" } as Record<
            string,
            string
          >
        )[mark.type];
        return tag ? `<${tag}>${s}</${tag}>` : s;
      }, escapeHtml(node.text));
    if (node.type === "citation") {
      const number = Number(node.attrs?.label);
      return Number.isSafeInteger(number) &&
        number > 0 &&
        number <= d.references.length
        ? `<sup><a href="#source-${number}">[${number}]</a></sup>`
        : "[?]";
    }
    if (node.type === "hardBreak") return "<br>";
    if (node.type === "horizontalRule") return "<hr>";
    const tag =
      (
        {
          doc: "section",
          paragraph: "p",
          heading: `h${headingLevel(node.attrs?.level)}`,
          bulletList: "ul",
          orderedList: "ol",
          listItem: "li",
          blockquote: "blockquote",
          codeBlock: "pre",
          table: "table",
          tableRow: "tr",
          tableCell: "td",
          tableHeader: "th",
        } as Record<string, string>
      )[node.type || ""] || "div";
    return `<${tag}>${(node.content || []).map(render).join("")}</${tag}>`;
  };
  const statuses = {
    current: t("创建时指向当前版本", "Current version at preparation"),
    older: t(
      "已有新版本，原文仍可找到",
      "Newer version available; passage retained",
    ),
    changed: t("原文已变，待复核", "Passage changed; review needed"),
    missing: t("引用无法核实", "Citation could not be verified"),
  };
  const warning = [
    d.checks.missing
      ? `${d.checks.missing} ${t("条引用无法核实", "unresolved citations")}`
      : "",
    d.checks.updated
      ? `${d.checks.updated} ${t("条引用待更新复核", "citations need version review")}`
      : "",
    d.checks.unreviewed
      ? `${d.checks.unreviewed} ${t("条发现尚未完成人工核对", "findings need manual review")}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<!doctype html><html lang="${zh ? "zh-CN" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(d.title)}</title><style>html{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f6f7f2;color:#303a2d;font:16px/1.8 system-ui,-apple-system,sans-serif;overflow-wrap:anywhere}main{max-width:860px;margin:36px auto;background:#fff;padding:56px 64px;border:1px solid #e4e7dc;border-top:5px solid #c7d894}header{padding-bottom:28px;border-bottom:1px solid #e4e7dc;margin-bottom:32px}.eyebrow{font-size:11px;letter-spacing:.16em;color:#657340;text-transform:uppercase}h1{font-size:32px;line-height:1.25;letter-spacing:-.025em;font-weight:600;margin:20px 0}h2{font-size:21px;margin-top:34px;line-height:1.4}h3,h4,h5,h6{font-size:17px;line-height:1.5}p{white-space:pre-wrap;margin:14px 0}.summary{color:#697361}.meta,footer{font-size:12px;color:#6b7464}.warning{background:#fff5df;border-left:3px solid #d1a947;padding:12px 16px;font-size:13px}blockquote{margin:16px 0;border-left:3px solid #c7d894;padding:4px 20px;color:#57624d}a{color:#63762b}sup{font-size:11px}table{border-collapse:collapse;display:block;overflow:auto;max-width:100%}td,th{border:1px solid #dfe4d4;padding:9px 12px}pre{white-space:pre-wrap;background:#f4f6ee;padding:16px}code{font-size:.9em}.sources{border-top:1px solid #dfe4d4;margin-top:42px;padding-top:12px}.source{padding:18px 0;border-bottom:1px solid #edf0e7;font-size:14px}.source:target{background:#f2f6e5}.source blockquote{font-size:14px}.source strong{font-weight:600}footer{margin-top:32px}hr{border:0;border-top:1px solid #dfe4d4}@media(max-width:620px){main{margin:0;padding:28px 22px;border-left:0;border-right:0}h1{font-size:26px}}@media print{body{background:#fff}main{border:0;margin:0;padding:12px;max-width:none}a{color:inherit}.source{break-inside:avoid}}</style></head><body><main><header><div class="eyebrow">Folio / ${t("研究交付", "Research delivery")}</div><h1>${escapeHtml(d.title)}</h1>${d.summary ? `<p class="summary">${escapeHtml(d.summary)}</p>` : ""}<p class="meta">${t("保存于", "Prepared")} ${escapeHtml(d.createdAt.replace("T", " ").replace(/\.\d+Z$/, " UTC"))} · ${t("固定版本", "Fixed edition")} ${escapeHtml(d.id.slice(0, 8))}</p></header>${warning ? `<aside class="warning">${escapeHtml(warning)}</aside>` : ""}${render(d.content)}${d.references.length ? `<section class="sources"><h2>${t("引用原文", "Source passages")}</h2>${d.references.map((r, i) => `<article class="source" id="source-${i + 1}"><strong>[${i + 1}] ${escapeHtml(r.name)}</strong><div class="meta">${t("页码", "Page")} ${r.page || "?"} · ${escapeHtml(r.versionDate || r.versionId)} · ${escapeHtml(statuses[r.status])}</div><blockquote>${escapeHtml(r.quote)}</blockquote></article>`).join("")}</section>` : ""}<footer>${t("此版本保存了交付时的正文与引用摘录，不会随工作空间更新。来源状态只反映创建时的引用检查，不能证明结论正确。", "This edition preserves the content and cited passages at preparation. It does not update with the workspace. Source checks describe citations at that time; they do not establish that a conclusion is correct.")}</footer></main></body></html>`;
}
export function deliveryMarkdown(d: Delivery) {
  const text = (value: string) => escapeHtml(value).replaceAll("|", "\\|");
  const render = (node: JSONContent): string => {
    if (node.text !== undefined) return text(node.text);
    if (node.type === "citation")
      return `[${text(String(node.attrs?.label || "?"))}]`;
    if (node.type === "hardBreak") return "  \n";
    if (node.type === "horizontalRule") return "\n---\n";
    if (node.type === "table") {
      const rows = (node.content || []).map((row) =>
        (row.content || []).map((cell) =>
          (cell.content || []).map(render).join(" ").replaceAll("\n", " "),
        ),
      );
      if (!rows.length) return "";
      const width = Math.max(...rows.map((r) => r.length));
      const row = (cells: string[]) =>
        `| ${Array.from({ length: width }, (_, i) => cells[i] || "").join(" | ")} |`;
      return [
        row(rows[0]),
        row(Array(width).fill("---")),
        ...rows.slice(1).map(row),
      ].join("\n");
    }
    if (node.type === "bulletList" || node.type === "orderedList")
      return (node.content || [])
        .map(
          (child, i) =>
            `${node.type === "orderedList" ? `${i + 1}.` : "-"} ${render(child).replaceAll("\n", "\n  ")}`,
        )
        .join("\n");
    const content = (node.content || [])
      .map(render)
      .join(["doc", "listItem"].includes(node.type || "") ? "\n\n" : "");
    if (node.type === "heading")
      return `${"#".repeat(headingLevel(node.attrs?.level))} ${content}`;
    if (node.type === "blockquote")
      return `> ${content.replaceAll("\n", "\n> ")}`;
    return content;
  };
  const zh = d.language === "zh";
  const statuses = zh
    ? {
        current: "创建时为当前版本",
        older: "有新版本",
        changed: "原文已变",
        missing: "引用无法核实",
      }
    : {
        current: "Current at preparation",
        older: "Newer version available",
        changed: "Passage changed",
        missing: "Unresolved citation",
      };
  const checks = zh
    ? `创建时检查：${d.checks.missing} 条引用无法核实，${d.checks.updated} 条引用待更新复核，${d.checks.unreviewed} 条发现待人工核对。`
    : `At preparation: ${d.checks.missing} unresolved citations, ${d.checks.updated} citations need version review, ${d.checks.unreviewed} findings need manual review.`;
  return `# ${text(d.title)}\n\n${text(d.summary)}\n\n${text(d.createdAt)} · ${text(d.id)}\n\n${checks}\n\n${render(d.content)}\n\n---\n\n${zh ? "引用原文（创建时状态）" : "Source passages (status at preparation)"}\n\n${d.references.map((r, i) => `[${i + 1}] ${text(r.name)} · p. ${r.page || "?"} · ${text(r.versionDate || r.versionId)} · ${statuses[r.status]}\n\n> ${text(r.quote).replaceAll("\n", "\n> ")}`).join("\n\n")}\n\n${zh ? "固定版本；引用检查不代表结论已经证实。" : "Fixed edition. Citation checks do not establish that a conclusion is correct."}`;
}
