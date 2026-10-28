import { uid, type Project } from "./model.ts";
import { validResearch } from "./research.ts";
import { validComparison } from "./comparison.ts";
import { validNotebook } from "./notebook.ts";
import { hashBytes } from "./file-hash.ts";
import { validateDocument } from "./integrity.ts";
import { validDeliveries } from "./delivery.ts";
import { validReviewHistory } from "./review.ts";
import { validConclusionLinks } from "./conclusions.ts";

type SourceKind = Project["sources"][number]["kind"];
const isRecord = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const isKind = (value: unknown): value is SourceKind =>
  value === "pdf" || value === "md" || value === "txt";
const isDate = (value: unknown): value is string =>
  typeof value === "string" &&
  !!value.trim() &&
  Number.isFinite(Date.parse(value));
const isId = (value: unknown): value is string =>
  typeof value === "string" && !!value.trim();
const kindFromName = (name: unknown): SourceKind | undefined => {
  if (typeof name !== "string") return;
  const extension = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase();
  return extension === "markdown"
    ? "md"
    : isKind(extension)
      ? extension
      : undefined;
};
const invalidMetadata = () =>
  new Error("备份元数据无效 / Invalid backup metadata");
function dateOr(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (!isDate(value)) throw invalidMetadata();
  return value;
}
function textOr(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw invalidMetadata();
  return value;
}

export async function restoreBackup(file: File): Promise<Project> {
  if (file.size > 150 * 1024 * 1024)
    throw new Error("备份过大 / Backup too large");
  const data = JSON.parse(await file.text());
  if (
    !isRecord(data) ||
    data.format !== "folio-project" ||
    data.schemaVersion !== 1 ||
    !isRecord(data.project) ||
    typeof data.project.name !== "string" ||
    data.project.content?.type !== "doc" ||
    !Array.isArray(data.project.sources) ||
    !Array.isArray(data.project.snapshots)
  )
    throw new Error("不是有效的 Folio 项目备份 / Invalid Folio backup");
  const p = data.project;
  const restoredAt = new Date().toISOString();
  // Missing historical display metadata can be inferred. Explicit malformed
  // values must not enter local storage and later fail in a reader or export.
  if (
    (p.id !== undefined && !isId(p.id)) ||
    (p.updatedAt !== undefined && !isDate(p.updatedAt)) ||
    (p.lastView !== undefined && typeof p.lastView !== "string") ||
    [p.example, p.favorite].some(
      (value) => value !== undefined && typeof value !== "boolean",
    ) ||
    [p.archivedAt, p.deletedAt, p.lastOpenedAt].some(
      (value) => value !== undefined && !isDate(value),
    )
  )
    throw invalidMetadata();
  p.createdAt = dateOr(p.createdAt, p.updatedAt ?? restoredAt);
  p.reportTitle = textOr(p.reportTitle, p.name);
  p.description = textOr(p.description, "");
  if (p.deliveries !== undefined && !validDeliveries(p.deliveries))
    throw new Error(
      "交付版本结构或大小无效 / Invalid delivery editions in backup",
    );
  if (p.reviewHistory !== undefined && !validReviewHistory(p.reviewHistory))
    throw new Error("复核历史结构无效 / Invalid review history in backup");
  if (p.notebook !== undefined && !validNotebook(p.notebook))
    throw new Error("研究笔记结构无效 / Invalid research notebook in backup");
  if (
    !validateDocument(p.content) ||
    p.snapshots.some(
      (s: Project["snapshots"][number]) =>
        !isRecord(s) ||
        s.content?.type !== "doc" ||
        !validateDocument(s.content),
    )
  )
    throw new Error("备份中的文档结构无效 / Invalid document in backup");
  for (const snapshot of p.snapshots) {
    if (snapshot.id !== undefined && !isId(snapshot.id))
      throw invalidMetadata();
    snapshot.id ??= uid();
    snapshot.reportTitle = textOr(snapshot.reportTitle, p.reportTitle);
    snapshot.title = textOr(snapshot.title, snapshot.reportTitle);
    snapshot.createdAt = dateOr(snapshot.createdAt, p.createdAt);
  }
  if (
    new Set(p.snapshots.map((s: Project["snapshots"][number]) => s.id)).size !==
    p.snapshots.length
  )
    throw new Error(
      "备份版本标识重复 / Duplicate snapshot identifiers in backup",
    );
  if (
    p.sources.length > 20 ||
    new Set(p.sources.map((s: Project["sources"][number]) => s?.id)).size !==
      p.sources.length
  )
    throw new Error("资料数量或标识无效 / Invalid source count or identifiers");
  if (p.comparison !== undefined && !validComparison(p.comparison))
    throw new Error("备份中的比较记录无效 / Invalid comparison in backup");
  if (p.research !== undefined && !validResearch(p.research))
    throw new Error(
      "备份中的问答记录无效 / Invalid research history in backup",
    );
  if (
    p.reading !== undefined &&
    (!p.reading ||
      typeof p.reading.sourceId !== "string" ||
      typeof p.reading.versionId !== "string" ||
      typeof p.reading.quote !== "string" ||
      !Number.isInteger(p.reading.page) ||
      p.reading.page < 1)
  )
    throw new Error(
      "备份中的阅读位置无效 / Invalid reading position in backup",
    );
  let originalBytes = 0;
  for (const s of p.sources) {
    if (
      !isRecord(s) ||
      !isId(s.id) ||
      typeof s.name !== "string" ||
      (s.kind !== undefined && !isKind(s.kind)) ||
      (s.color !== undefined && typeof s.color !== "string") ||
      !Array.isArray(s.versions) ||
      !s.versions.length ||
      new Set(
        s.versions.map(
          (v: Project["sources"][number]["versions"][number]) => v?.id,
        ),
      ).size !== s.versions.length
    )
      throw new Error("资料结构无效 / Invalid source");
    const declaredKind = s.kind as SourceKind | undefined;
    const namedKind = kindFromName(s.name);
    for (const v of s.versions) {
      if (
        !isRecord(v) ||
        (v.text !== undefined && typeof v.text !== "string") ||
        !isId(v.id) ||
        (v.kind !== undefined && !isKind(v.kind)) ||
        (v.fileName !== undefined && typeof v.fileName !== "string") ||
        (v.size !== undefined &&
          (!Number.isSafeInteger(v.size) || v.size < 0)) ||
        (v.hash !== undefined && !isId(v.hash)) ||
        v.original !== undefined ||
        !Array.isArray(v.pages) ||
        !v.pages.length ||
        v.pages.length > 300 ||
        v.pages.some(
          (page: { page: unknown; text: unknown }, index: number) =>
            !isRecord(page) ||
            page.page !== index + 1 ||
            typeof page.text !== "string",
        )
      )
        throw new Error("资料版本无效 / Invalid version");
      v.text ??= v.pages
        .map((page: { text: string }) => page.text)
        .join("\n\n");
      v.createdAt = dateOr(v.createdAt, p.createdAt);
      const hasOriginal = v.originalBase64 !== undefined;
      // A version's own filename can differ from its source's current type.
      // Without an original, the retained extracted text is safely readable as TXT.
      v.kind ??=
        kindFromName(v.fileName) ||
        declaredKind ||
        namedKind ||
        (!hasOriginal ? "txt" : undefined);
      if (!isKind(v.kind))
        throw new Error(
          "无法判断原文件类型，请补充资料类型或原文件名 / Cannot determine original file type. Provide its source type or original filename.",
        );
      if (hasOriginal) {
        if (
          typeof v.originalBase64 !== "string" ||
          v.originalBase64.length > 28_000_000 ||
          v.originalBase64.length % 4 !== 0 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(v.originalBase64)
        )
          throw new Error(
            "原始文件过大或无效 / Invalid or oversized original file",
          );
        originalBytes +=
          Math.floor((v.originalBase64.length * 3) / 4) -
          (v.originalBase64.endsWith("==")
            ? 2
            : v.originalBase64.endsWith("=")
              ? 1
              : 0);
        if (originalBytes > 80 * 1024 * 1024)
          throw new Error(
            "原始文件总量过大 / Original files exceed the project limit",
          );
        const bytes = Uint8Array.from(atob(v.originalBase64), (c) =>
          c.charCodeAt(0),
        );
        if ((await hashBytes(bytes.buffer)) !== v.hash)
          throw new Error("备份文件校验失败 / Backup checksum failed");
        if (v.size !== undefined && v.size !== bytes.byteLength)
          throw new Error(
            "原文件大小与备份记录不符 / Original file size does not match backup metadata",
          );
        v.size = bytes.byteLength;
        v.original = new Blob([bytes], {
          type: v.kind === "pdf" ? "application/pdf" : "text/plain",
        });
        delete v.originalBase64;
      } else {
        const bytes = new TextEncoder().encode(v.text);
        v.size ??= bytes.byteLength;
        v.hash ??= await hashBytes(bytes.buffer);
      }
    }
    s.kind ??= s.versions.at(-1)!.kind;
    s.color ??= s.kind === "pdf" ? "clay" : s.kind === "txt" ? "blue" : "green";
  }
  const restored: Project = {
    ...p,
    id: uid(),
    name: `${p.name} · restored`,
    reportTitle: p.reportTitle,
    description: p.description,
    content: p.content,
    sources: p.sources,
    snapshots: p.snapshots,
    createdAt: p.createdAt,
    deletedAt: undefined,
    archivedAt: undefined,
    lastOpenedAt: undefined,
    favorite: p.favorite === true,
    updatedAt: restoredAt,
  };
  if (!validConclusionLinks(restored))
    throw new Error(
      "备份中的结论关联缺失或不一致 / Invalid or inconsistent conclusion links in backup",
    );
  return restored;
}
