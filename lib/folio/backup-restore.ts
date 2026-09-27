import { uid, type Project } from "./model.ts";
import { validResearch } from "./research.ts";
import { validComparison } from "./comparison.ts";
import { validNotebook } from "./notebook.ts";
import { hashBytes } from "./file-hash.ts";
import { validateDocument } from "./integrity.ts";
export async function restoreBackup(file: File): Promise<Project> {
  if (file.size > 150 * 1024 * 1024)
    throw new Error("备份过大 / Backup too large");
  const data = JSON.parse(await file.text());
  if (
    !data ||
    data.format !== "folio-project" ||
    data.schemaVersion !== 1 ||
    !data.project ||
    typeof data.project.name !== "string" ||
    data.project.content?.type !== "doc" ||
    !Array.isArray(data.project.sources) ||
    !Array.isArray(data.project.snapshots)
  )
    throw new Error("不是有效的 Folio 项目备份 / Invalid Folio backup");
  const p = data.project;
  if (p.notebook !== undefined && !validNotebook(p.notebook))
    throw new Error("研究笔记结构无效 / Invalid research notebook in backup");
  if (
    !validateDocument(p.content) ||
    p.snapshots.some(
      (s: Project["snapshots"][number]) => !s || !validateDocument(s.content),
    )
  )
    throw new Error("备份中的文档结构无效 / Invalid document in backup");
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
      !s ||
      typeof s.id !== "string" ||
      typeof s.name !== "string" ||
      !Array.isArray(s.versions) ||
      !s.versions.length ||
      new Set(
        s.versions.map(
          (v: Project["sources"][number]["versions"][number]) => v?.id,
        ),
      ).size !== s.versions.length
    )
      throw new Error("资料结构无效 / Invalid source");
    for (const v of s.versions) {
      if (
        !v ||
        typeof v.text !== "string" ||
        typeof v.id !== "string" ||
        !Array.isArray(v.pages) ||
        !v.pages.length ||
        v.pages.length > 300 ||
        v.pages.some(
          (page: { page: unknown; text: unknown }) =>
            !page ||
            !Number.isInteger(page.page) ||
            Number(page.page) < 1 ||
            typeof page.text !== "string",
        )
      )
        throw new Error("资料版本无效 / Invalid version");
      if (v.originalBase64) {
        if (
          typeof v.originalBase64 !== "string" ||
          v.originalBase64.length > 28_000_000
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
        v.original = new Blob([bytes], {
          type: s.kind === "pdf" ? "application/pdf" : "text/plain",
        });
        delete v.originalBase64;
      }
    }
  }
  return {
    ...p,
    id: uid(),
    name: `${p.name} · restored`,
    updatedAt: new Date().toISOString(),
  };
}
