import type { JSONContent } from "@tiptap/react";
import type { Project } from "./model";
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
      (p) => p.page === attrs.page && p.text.includes(attrs.quote as string),
    )
  )
    return "missing";
  const latest = source.versions[source.versions.length - 1];
  if (latest.id === version.id) return "current";
  return latest.pages.some((p) => p.text.includes(attrs.quote as string))
    ? "older"
    : "changed";
}
export function collectCitations(node: JSONContent): JSONContent[] {
  return [
    ...(node.type === "citation" ? [node] : []),
    ...(node.content || []).flatMap(collectCitations),
  ];
}
export function countChanges(project: Project) {
  return collectCitations(project.content).filter(
    (c) => citationStatus(c.attrs || {}, project) !== "current",
  ).length;
}
export function validateDocument(node: unknown, depth = 0): boolean {
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
  return (
    n.content === undefined ||
    (Array.isArray(n.content) &&
      n.content.every((c) => validateDocument(c, depth + 1)))
  );
}
