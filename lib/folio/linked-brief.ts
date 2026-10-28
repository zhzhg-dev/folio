import type { JSONContent } from "@tiptap/react";
import { uid, type Finding, type Language, type Project } from "./model.ts";
import { findingNodes, notebookFor } from "./notebook.ts";
import { comparisonBrief } from "./comparison.ts";

export type BriefLinkOrigin = "finding" | "comparison";
export type BriefLinkStatus = "current" | "updated" | "missing" | "archived";
export type BriefLinkAttrs = {
  id: string;
  origin: BriefLinkOrigin;
  findingId: string;
  sourceRevision: number;
  sourceSignature: string;
  baselineHash: string;
  language: Language;
};
export type LinkedBriefItem = {
  id: string;
  origin: BriefLinkOrigin;
  findingId?: string;
  title: string;
  status: BriefLinkStatus;
  edited: boolean;
  path: number[];
  document: string;
  block: JSONContent;
  candidate?: JSONContent;
  error?: string;
};
export type LinkedBriefInsertion = {
  content: JSONContent;
  blockId: string;
  inserted: boolean;
};

// Change detection only, not a security checksum. Ignore editor-added defaults
// while retaining authored text, marks, table spans and paragraph structure.
function normalized(node: JSONContent): unknown {
  const result: Record<string, unknown> = { type: node.type };
  if (node.text !== undefined) result.text = node.text;
  if (node.attrs) {
    const attrs = Object.fromEntries(
      Object.entries(node.attrs)
        .filter(
          ([key, value]) =>
            value !== null &&
            value !== undefined &&
            !(["colspan", "rowspan", "start"].includes(key) && value === 1),
        )
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    if (Object.keys(attrs).length) result.attrs = attrs;
  }
  if (node.marks?.length)
    result.marks = node.marks.map((mark) => normalized(mark));
  if (node.content?.length) result.content = node.content.map(normalized);
  return result;
}
export function briefFingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let a = 2166136261,
    b = 3339675911;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 2246822519);
  }
  return `v1-${text.length.toString(36)}-${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}
export function briefContentHash(content: JSONContent[]): string {
  return briefFingerprint(content.map(normalized));
}
function findingSource(project: Project, id: string) {
  const notebook = notebookFor(project);
  const finding = notebook.findings.find((f) => f.id === id);
  if (finding) return { finding, archived: false };
  const archived = notebook.archived
    ?.flatMap((item) => item.findings)
    .find((f) => f.id === id);
  return archived ? { finding: archived, archived: true } : undefined;
}
function unavailableComparisonFinding(project: Project) {
  for (const cell of project.comparison?.cells || []) {
    if (!cell.findingId) continue;
    const source = findingSource(project, cell.findingId);
    if (!source || source.archived)
      return source?.archived ? "archived" : "missing";
  }
  return undefined;
}
function makeBlock(
  project: Project,
  origin: BriefLinkOrigin,
  findingId: string,
  language: Language,
  id: string = uid(),
): JSONContent {
  let content: JSONContent[],
    payload: unknown,
    revision = 1;
  if (origin === "finding") {
    const source = findingSource(project, findingId);
    if (!source || source.archived)
      throw new Error(
        "发现已归档或不存在，请先恢复 / Restore the archived or missing finding before updating.",
      );
    const finding = source.finding;
    content = findingNodes(finding, project, language);
    revision = (finding as Finding & { revision?: number }).revision || 1;
    payload = {
      value: finding.value,
      kind: finding.kind,
      note: finding.note,
      questionId: finding.questionId,
      evidence: finding.evidence,
      reviewedAt: finding.reviewedAt || "",
      revision,
      content: content.map(normalized),
    };
  } else {
    if (!project.comparison)
      throw new Error("比较表已不存在 / The comparison no longer exists.");
    if (unavailableComparisonFinding(project))
      throw new Error(
        "比较中的关联发现已归档或不存在，请先恢复 / Restore archived or missing comparison findings before updating.",
      );
    content = comparisonBrief(project, language);
    payload = {
      comparison: project.comparison,
      content: content.map(normalized),
    };
  }
  return {
    type: "conclusionBlock",
    attrs: {
      id,
      origin,
      findingId,
      sourceRevision: revision,
      sourceSignature: briefFingerprint(payload),
      baselineHash: briefContentHash(content),
      language,
    } satisfies BriefLinkAttrs,
    content,
  };
}
function blocks(content: JSONContent) {
  const result: { block: JSONContent; path: number[] }[] = [];
  const visit = (node: JSONContent, path: number[]) => {
    if (node.type === "conclusionBlock") result.push({ block: node, path });
    else
      node.content?.forEach((child, index) => visit(child, [...path, index]));
  };
  visit(content, []);
  return result;
}
function insert(
  project: Project,
  origin: BriefLinkOrigin,
  findingId: string,
  language: Language,
): LinkedBriefInsertion {
  const existing = blocks(project.content).find(
    ({ block }) =>
      block.attrs?.origin === origin &&
      (origin === "comparison" || block.attrs?.findingId === findingId),
  );
  if (existing)
    return {
      content: project.content,
      blockId: String(existing.block.attrs!.id),
      inserted: false,
    };
  const block = makeBlock(project, origin, findingId, language);
  return {
    content: {
      ...structuredClone(project.content),
      content: [
        ...(project.content.content || []),
        block,
        { type: "paragraph" },
      ],
    },
    blockId: String(block.attrs!.id),
    inserted: true,
  };
}
export function insertLinkedFinding(
  project: Project,
  findingId: string,
  language: Language,
) {
  return insert(project, "finding", findingId, language);
}
export function insertLinkedComparison(project: Project, language: Language) {
  return insert(project, "comparison", "", language);
}
export function linkedBriefItems(project: Project): LinkedBriefItem[] {
  const document = JSON.stringify(project.content);
  return blocks(project.content).map(({ block, path }) => {
    const attrs = block.attrs as BriefLinkAttrs;
    const source =
      attrs.origin === "finding"
        ? findingSource(project, attrs.findingId)
        : undefined;
    const title =
      attrs.origin === "comparison"
        ? attrs.language === "zh"
          ? "方案比较简报"
          : "Decision brief"
        : source?.finding.value ||
          (attrs.language === "zh" ? "原发现不可用" : "Finding unavailable");
    const item: LinkedBriefItem = {
      id: attrs.id,
      origin: attrs.origin,
      findingId: attrs.findingId || undefined,
      title,
      path,
      document,
      block,
      status: source?.archived ? "archived" : "missing",
      edited: briefContentHash(block.content || []) !== attrs.baselineHash,
    };
    if (source?.archived || (attrs.origin === "finding" && !source))
      return item;
    if (attrs.origin === "comparison") {
      const unavailable = unavailableComparisonFinding(project);
      if (unavailable) {
        item.status = unavailable;
        item.error =
          "比较中的关联发现已归档或不存在，请先恢复 / Restore archived or missing comparison findings before updating.";
        return item;
      }
    }
    try {
      item.candidate = makeBlock(
        project,
        attrs.origin,
        attrs.findingId,
        attrs.language,
        attrs.id,
      );
      item.status =
        item.candidate.attrs!.sourceSignature === attrs.sourceSignature
          ? "current"
          : "updated";
    } catch (error) {
      item.error =
        error instanceof Error
          ? error.message
          : "无法准备更新 / Could not prepare update.";
    }
    return item;
  });
}
function selected(content: JSONContent, target: LinkedBriefItem) {
  if (JSON.stringify(content) !== target.document)
    throw new Error(
      "简报已变化，请重新查看更新 / The brief changed. Review the update again.",
    );
  let node = content;
  for (const index of target.path) node = node.content?.[index] as JSONContent;
  if (
    node?.type !== "conclusionBlock" ||
    node.attrs?.id !== target.id ||
    JSON.stringify(node) !== JSON.stringify(target.block)
  )
    throw new Error(
      "关联段落已变化，请重新选择 / The linked section changed. Select it again.",
    );
  return node;
}
function replaceAt(
  content: JSONContent,
  path: number[],
  replacement: JSONContent[],
) {
  const next = structuredClone(content);
  let parent = next;
  for (const index of path.slice(0, -1)) parent = parent.content![index];
  if (!path.length || !parent.content)
    throw new Error("关联段落位置无效 / Invalid linked section location.");
  parent.content.splice(path.at(-1)!, 1, ...replacement);
  return next;
}
export function updateLinkedBrief(
  project: Project,
  target: LinkedBriefItem,
  options: { replaceEdited?: boolean } = {},
): JSONContent {
  const current = selected(project.content, target);
  if (
    briefContentHash(current.content || []) !== current.attrs!.baselineHash &&
    !options.replaceEdited
  )
    throw new Error(
      "此段落有你的修改，请先确认替换 / This section contains your edits. Confirm replacement first.",
    );
  if (!target.candidate)
    throw new Error(
      "无法更新此段落，请先恢复发现或修复证据 / Restore the finding or repair its evidence before updating.",
    );
  const attrs = target.block.attrs as BriefLinkAttrs;
  const candidate = makeBlock(
    project,
    attrs.origin,
    attrs.findingId,
    attrs.language,
    attrs.id,
  );
  if (
    candidate.attrs!.sourceSignature !== target.candidate.attrs!.sourceSignature
  )
    throw new Error(
      "原结论已再次变化，请重新查看 / The conclusion changed again. Review the latest update.",
    );
  return replaceAt(project.content, target.path, [candidate]);
}
export function unlinkBriefBlock(
  content: JSONContent,
  target: LinkedBriefItem,
): JSONContent {
  const current = selected(content, target);
  return replaceAt(
    content,
    target.path,
    structuredClone(current.content || []),
  );
}
