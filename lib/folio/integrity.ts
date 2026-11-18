import type { JSONContent } from "@tiptap/react";
import type { Project } from "./model";
import { pageContainsQuote } from "./evidence-cache.ts";
export function citationStatus(
  attrs: Record<string, unknown>,
  project: Project,
): "current" | "older" | "changed" | "missing" {
  const source = project.sources.find((s) => s.id === attrs.sourceId);
  const version = source?.versions.find((v) => v.id === attrs.versionId);
  if (
    !source ||
    !version ||
    typeof attrs.quote !== "string" ||
    !attrs.quote ||
    !version.pages.some(
      (p) =>
        p.page === attrs.page && pageContainsQuote(p, attrs.quote as string),
    )
  )
    return "missing";
  const latest = source.versions[source.versions.length - 1];
  if (latest.id === version.id) return "current";
  return latest.pages.some((p) => pageContainsQuote(p, attrs.quote as string))
    ? "older"
    : "changed";
}
export function collectCitations(node: JSONContent): JSONContent[] {
  return [
    ...(node.type === "citation" ? [node] : []),
    ...(node.content || []).flatMap(collectCitations),
  ];
}
export function containsConclusionLinks(node: JSONContent): boolean {
  return (
    node.type === "conclusionBlock" ||
    (Array.isArray(node.content) &&
      node.content.some(
        (child) =>
          child && typeof child === "object" && containsConclusionLinks(child),
      ))
  );
}
// Deliveries and ordinary exports carry the writing, never internal links that
// could be interpreted as a live relationship after leaving the workspace.
export function stripConclusionLinks(document: JSONContent): JSONContent {
  const visit = (node: JSONContent): JSONContent[] => {
    if (node.type === "conclusionBlock")
      return (node.content || []).flatMap(visit);
    return [
      {
        ...structuredClone(node),
        ...(node.content ? { content: node.content.flatMap(visit) } : {}),
      },
    ];
  };
  const nodes = visit(document);
  return document.type === "conclusionBlock"
    ? { type: "doc", content: nodes }
    : nodes[0];
}
export function countChanges(project: Project) {
  return collectCitations(project.content).filter(
    (c) => citationStatus(c.attrs || {}, project) !== "current",
  ).length;
}
export function validateDocument(
  node: unknown,
  depth = 0,
  conclusionIds = new Set<string>(),
): boolean {
  if (!node || typeof node !== "object" || depth > 30) return false;
  const n = node as JSONContent;
  if (
    n.marks !== undefined &&
    (!Array.isArray(n.marks) ||
      n.marks.length > 12 ||
      n.marks.some(
        (mark) =>
          !mark ||
          typeof mark !== "object" ||
          !["bold", "italic", "strike", "code", "underline", "link"].includes(
            mark.type,
          ),
      ))
  )
    return false;
  const types = [
    "doc",
    "paragraph",
    "heading",
    "text",
    "citation",
    "blockquote",
    "bulletList",
    "orderedList",
    "listItem",
    "hardBreak",
    "horizontalRule",
    "codeBlock",
    "table",
    "tableRow",
    "tableCell",
    "tableHeader",
    "conclusionBlock",
  ];
  if (
    !n.type ||
    !types.includes(n.type) ||
    (n.text !== undefined && typeof n.text !== "string")
  )
    return false;
  if (
    n.type === "citation" &&
    (!n.attrs ||
      !["sourceId", "versionId", "quote", "label"].every(
        (k) => typeof n.attrs![k] === "string",
      ))
  )
    return false;
  if (n.type === "conclusionBlock") {
    const a = n.attrs;
    const keys = [
      "id",
      "origin",
      "findingId",
      "sourceRevision",
      "sourceSignature",
      "baselineHash",
      "language",
    ];
    const signature = (value: unknown) =>
      typeof value === "string" &&
      value.length <= 80 &&
      /^v1-[0-9a-z]+-[0-9a-f]{16}$/.test(value);
    const children = [
      "paragraph",
      "heading",
      "blockquote",
      "bulletList",
      "orderedList",
      "horizontalRule",
      "codeBlock",
      "table",
    ];
    if (
      !a ||
      Object.keys(a).some((key) => !keys.includes(key)) ||
      typeof a.id !== "string" ||
      !a.id.trim() ||
      a.id.length > 200 ||
      !["finding", "comparison"].includes(a.origin) ||
      typeof a.findingId !== "string" ||
      a.findingId.length > 500 ||
      (a.origin === "finding" ? !a.findingId.trim() : a.findingId !== "") ||
      !Number.isSafeInteger(a.sourceRevision) ||
      a.sourceRevision < 1 ||
      !signature(a.sourceSignature) ||
      !signature(a.baselineHash) ||
      !["en", "zh"].includes(a.language) ||
      n.text !== undefined ||
      n.marks !== undefined ||
      !Array.isArray(n.content) ||
      !n.content.length ||
      n.content.length > 2000 ||
      n.content.some(
        (child) =>
          !child ||
          !children.includes(child.type || "") ||
          containsConclusionLinks(child),
      )
    )
      return false;
    if (conclusionIds.has(a.id)) return false;
    conclusionIds.add(a.id);
  }
  return (
    n.content === undefined ||
    (Array.isArray(n.content) &&
      n.content.every((c) => validateDocument(c, depth + 1, conclusionIds)))
  );
}
