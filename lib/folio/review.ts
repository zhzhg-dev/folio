import type { JSONContent } from "@tiptap/react";
import type { Project, ComparisonCell, Finding } from "./model.ts";
import { citationStatus } from "./integrity.ts";
import { cellStatus, validComparison } from "./comparison.ts";

export type CitationTarget = {
  path: number[];
  attrs: Record<string, unknown>;
  document: string;
};
export type ReviewItem = {
  id: string;
  scope: "findings" | "comparison" | "brief";
  title: string;
  value: string;
  status: "missing" | "changed" | "older" | "unreviewed";
  sourceIds: string[];
  findingId?: string;
  optionId?: string;
  criterionId?: string;
  target?: CitationTarget;
};
export type ReviewRevision = {
  id: string;
  title: string;
  createdAt: string;
  scope: "findings" | "comparison";
  before: Finding | ComparisonCell;
};
export function validReviewHistory(value: unknown): value is ReviewRevision[] {
  if (!Array.isArray(value) || value.length > 30) return false;
  return value.every((r) => {
    if (
      !r ||
      typeof r.id !== "string" ||
      r.id.length > 200 ||
      typeof r.title !== "string" ||
      r.title.length > 500 ||
      typeof r.createdAt !== "string" ||
      !Number.isFinite(Date.parse(r.createdAt)) ||
      !["findings", "comparison"].includes(r.scope) ||
      !r.before
    )
      return false;
    const b = r.before;
    if (
      r.scope === "findings" &&
      (typeof b.id !== "string" ||
        b.id.length > 500 ||
        typeof b.questionId !== "string" ||
        b.questionId.length > 200 ||
        typeof b.note !== "string" ||
        b.note.length > 10000)
    )
      return false;
    const cell =
      r.scope === "findings"
        ? { ...b, optionId: "finding", criterionId: "question" }
        : b;
    return validComparison({
      objective: "",
      constraints: "",
      recommendation: "",
      limitations: "",
      options: [{ id: cell.optionId, name: "Item", sourceIds: [] }],
      criteria: [{ id: cell.criterionId, name: "Question" }],
      cells: [cell],
    });
  });
}
export function citationTargets(content: JSONContent): CitationTarget[] {
  const result: CitationTarget[] = [];
  const document = JSON.stringify(content);
  const visit = (node: JSONContent, path: number[]) => {
    if (node.type === "citation")
      result.push({ path, attrs: { ...node.attrs }, document });
    node.content?.forEach((child, i) => visit(child, [...path, i]));
  };
  visit(content, []);
  return result;
}
export function replaceCitation(
  content: JSONContent,
  target: CitationTarget,
  attrs: Record<string, unknown>,
) {
  // Refuse a stale selection even if a duplicate citation moved into its old path.
  if (JSON.stringify(content) !== target.document) return null;
  const next = structuredClone(content);
  let node: JSONContent | undefined = next;
  for (const i of target.path) node = node?.content?.[i];
  if (
    node?.type !== "citation" ||
    JSON.stringify(node.attrs) !== JSON.stringify(target.attrs)
  )
    return null;
  node.attrs = { ...attrs };
  return next;
}
export function projectReview(project: Project): ReviewItem[] {
  const result: ReviewItem[] = [];
  const state = (cell: ComparisonCell) => {
    const states = cell.evidence.map((e) => citationStatus(e, project));
    if (states.includes("missing")) return "missing";
    if (states.includes("changed")) return "changed";
    if (states.includes("older")) return "older";
    const status = cellStatus(cell, project);
    return status === "reviewed"
      ? null
      : status === "missing"
        ? "missing"
        : "unreviewed";
  };
  // A legacy comparison's notebook projection is not a second stored finding.
  project.notebook?.findings.forEach((finding) => {
    const status = state({
      ...finding,
      optionId: finding.id,
      criterionId: finding.questionId,
    });
    if (status)
      result.push({
        id: `finding:${finding.id}`,
        scope: "findings",
        findingId: finding.id,
        title:
          project.notebook!.questions.find((q) => q.id === finding.questionId)
            ?.title || "",
        value: finding.value,
        status,
        sourceIds: [...new Set(finding.evidence.map((e) => e.sourceId))],
      });
  });
  const comparison = project.comparison;
  comparison?.cells
    .filter((c) => c.value.trim() || c.evidence.length)
    .forEach((cell) => {
      const status = state(cell);
      if (status)
        result.push({
          id: `cell:${JSON.stringify([cell.optionId, cell.criterionId])}`,
          scope: "comparison",
          optionId: cell.optionId,
          criterionId: cell.criterionId,
          title: [
            comparison.options.find((o) => o.id === cell.optionId)?.name,
            comparison.criteria.find((c) => c.id === cell.criterionId)?.name,
          ]
            .filter(Boolean)
            .join(" · "),
          value: cell.value,
          status,
          sourceIds: [...new Set(cell.evidence.map((e) => e.sourceId))],
        });
    });
  citationTargets(project.content).forEach((target) => {
    const status = citationStatus(target.attrs, project);
    if (status !== "current")
      result.push({
        id: `brief:${target.path.join(".")}`,
        scope: "brief",
        title: project.reportTitle,
        value: String(target.attrs.quote || ""),
        status,
        sourceIds: [String(target.attrs.sourceId)],
        target,
      });
  });
  const priority = { missing: 0, changed: 1, older: 2, unreviewed: 3 };
  return result.sort((a, b) => priority[a.status] - priority[b.status]);
}
