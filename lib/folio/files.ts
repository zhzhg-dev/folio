import {
  uid,
  plainText,
  citations,
  type Project,
  type Source,
  type SourceVersion,
} from "./model.ts";
import type { JSONContent } from "@tiptap/react";
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[<>:"/\\|?*]/g, "-");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export async function hashBytes(bytes: ArrayBuffer) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function readFile(file: File): Promise<Source> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("单个文件请控制在 20 MB 内 / Maximum file size: 20 MB");
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["pdf", "txt", "md", "markdown"].includes(ext || ""))
    throw new Error("支持 PDF、TXT、Markdown / Supported: PDF, TXT, Markdown");
  const bytes = await file.arrayBuffer();
  let pages: SourceVersion["pages"] = [];
  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({ data: bytes.slice(0) });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 300)
        throw new Error("PDF 请控制在 300 页内 / Maximum: 300 pages");
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("")
          .trim();
        pages.push({ page: i, text });
      }
    } finally {
      await task.destroy();
    }
  } else pages = [{ page: 1, text: new TextDecoder().decode(bytes) }];
  const text = pages.map((p) => p.text).join("\n\n");
  if (!text.trim())
    throw new Error(
      "没有可读取的文字。扫描件需要先进行 OCR / No text found. Scans need OCR.",
    );
  const kind = ext === "pdf" ? "pdf" : ext === "txt" ? "txt" : "md";
  return {
    id: uid(),
    name: file.name,
    kind,
    color: kind === "pdf" ? "clay" : kind === "txt" ? "blue" : "green",
    versions: [
      {
        id: uid(),
        text,
        pages,
        createdAt: new Date().toISOString(),
        hash: await hashBytes(bytes),
        size: bytes.byteLength,
        original: file,
        fileName: file.name,
        kind,
      },
    ],
  };
}
export async function sourceFromText(
  name: string,
  text: string,
): Promise<Source> {
  return readFile(
    new File([text], name.endsWith(".txt") ? name : `${name}.txt`, {
      type: "text/plain",
    }),
  );
}
export function markdown(node: JSONContent): string {
  if (node.type === "citation") return `[${node.attrs?.label}]`;
  if (node.text)
    return (node.marks || []).reduce(
      (text, mark) =>
        mark.type === "bold"
          ? `**${text}**`
          : mark.type === "italic"
            ? `*${text}*`
            : text,
      node.text,
    );
  const children = node.content || [];
  if (node.type === "heading")
    return `${"#".repeat(node.attrs?.level || 2)} ${children.map(markdown).join("")}`;
  if (node.type === "blockquote")
    return children
      .map(markdown)
      .join("\n")
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
  if (node.type === "bulletList" || node.type === "orderedList")
    return children
      .map(
        (c, i) =>
          `${node.type === "bulletList" ? "-" : `${i + 1}.`} ${markdown(c)}`,
      )
      .join("\n");
  return children
    .map(markdown)
    .join(
      ["doc", "listItem", "table", "tableRow"].includes(node.type || "")
        ? "\n\n"
        : "",
    );
}
export function referenceLines(project: Project) {
  const seen = new Set<string>();
  return citations(project.content).flatMap((c) => {
    const key = `${c.attrs?.label}:${c.attrs?.sourceId}:${c.attrs?.versionId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const source = project.sources.find((s) => s.id === c.attrs?.sourceId);
    const index =
      source?.versions.findIndex((v) => v.id === c.attrs?.versionId) ?? -1;
    return [
      `[${c.attrs?.label}] ${source?.name || "Missing source"} · v${index + 1} · p.${c.attrs?.page || 1}\n“${c.attrs?.quote || ""}”`,
    ];
  });
}
export function exportMarkdown(project: Project) {
  const references = referenceLines(project);
  download(
    new Blob(
      [
        `# ${project.reportTitle}\n\n${project.description}\n\n${markdown(project.content)}${references.length ? `\n\n---\n\n## 参考来源 / Sources\n\n${references.join("\n\n")}` : ""}`,
      ],
      { type: "text/markdown;charset=utf-8" },
    ),
    `${project.reportTitle}.md`,
  );
}
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function exportHtml(project: Project) {
  const render = (node: JSONContent): string => {
    if (node.text)
      return (node.marks || []).reduce(
        (v, m) =>
          m.type === "bold"
            ? `<strong>${v}</strong>`
            : m.type === "italic"
              ? `<em>${v}</em>`
              : v,
        escape(node.text!),
      );
    if (node.type === "citation")
      return `<sup>[${escape(String(node.attrs?.label))}]</sup>`;
    const tag =
      (
        {
          doc: "main",
          paragraph: "p",
          heading: `h${node.attrs?.level || 2}`,
          bulletList: "ul",
          orderedList: "ol",
          listItem: "li",
          blockquote: "blockquote",
          table: "table",
          tableRow: "tr",
          tableCell: "td",
          tableHeader: "th",
          hardBreak: "br",
        } as Record<string, string>
      )[node.type || ""] || "div";
    return `<${tag}>${(node.content || []).map(render).join("")}</${tag}>`;
  };
  const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><title>${escape(project.reportTitle)}</title><style>body{font:16px/1.9 system-ui,sans-serif;color:#303c31;max-width:760px;margin:60px auto;padding:0 24px}h1{font-size:34px}h2{margin-top:2em}blockquote{border-left:3px solid #8aa379;padding-left:20px;color:#687c5d}sup{color:#668649}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px}footer{border-top:1px solid #ddd;margin-top:40px;font-size:13px;white-space:pre-wrap}</style><h1>${escape(project.reportTitle)}</h1><p>${escape(project.description)}</p>${render(project.content)}<footer>${escape(referenceLines(project).join("\n\n"))}</footer></html>`;
  download(
    new Blob([html], { type: "text/html;charset=utf-8" }),
    `${project.reportTitle}.html`,
  );
}
export async function exportWord(project: Project) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
  } = await import("docx");
  const inline = (node: JSONContent): InstanceType<typeof TextRun>[] =>
    node.type === "citation"
      ? [
          new TextRun({
            text: `[${node.attrs?.label}]`,
            superScript: true,
            color: "537044",
          }),
        ]
      : node.text
        ? [
            new TextRun({
              text: node.text,
              bold: node.marks?.some((m) => m.type === "bold"),
              italics: node.marks?.some((m) => m.type === "italic"),
            }),
          ]
        : (node.content || []).flatMap(inline);
  const blocks = (
    nodes: JSONContent[],
  ): (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] =>
    nodes.flatMap((node) => {
      if (node.type === "table")
        return [
          new Table({
            rows: (node.content || []).map(
              (row) =>
                new TableRow({
                  children: (row.content || []).map(
                    (cell) =>
                      new TableCell({ children: blocks(cell.content || []) }),
                  ),
                }),
            ),
          }),
        ];
      if (["bulletList", "orderedList"].includes(node.type || ""))
        return (node.content || []).flatMap((item, i) =>
          (item.content || []).map(
            (n) =>
              new Paragraph({
                children: [
                  ...(node.type === "orderedList"
                    ? [new TextRun(`${i + 1}. `)]
                    : []),
                  ...inline(n),
                ],
                bullet: node.type === "bulletList" ? { level: 0 } : undefined,
                spacing: { after: 160 },
              }),
          ),
        );
      if (node.type === "blockquote")
        return (node.content || []).map(
          (n) =>
            new Paragraph({
              children: inline(n),
              indent: { left: 360 },
              spacing: { after: 200 },
            }),
        );
      return [
        new Paragraph({
          children: inline(node),
          heading:
            node.type === "heading"
              ? node.attrs?.level === 3
                ? HeadingLevel.HEADING_3
                : HeadingLevel.HEADING_2
              : undefined,
          spacing: { after: 220 },
        }),
      ];
    });
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 23 },
          paragraph: { spacing: { line: 340 } },
        },
      },
    },
    sections: [
      {
        children: [
          new Paragraph({
            text: project.reportTitle,
            heading: HeadingLevel.TITLE,
          }),
          new Paragraph({ text: project.description, spacing: { after: 400 } }),
          ...blocks(project.content.content || []),
          new Paragraph({
            text: "参考来源 / Sources",
            heading: HeadingLevel.HEADING_2,
          }),
          ...referenceLines(project).map(
            (text) => new Paragraph({ text, spacing: { after: 180 } }),
          ),
        ],
      },
    ],
  });
  download(await Packer.toBlob(doc), `${project.reportTitle}.docx`);
}
export async function exportBackup(project: Project) {
  const sources = await Promise.all(
    project.sources.map(async (s) => ({
      ...s,
      versions: await Promise.all(
        s.versions.map(async (v) => {
          const { original, ...rest } = v;
          let originalBase64: string | undefined;
          if (original) {
            const bytes = new Uint8Array(await original.arrayBuffer());
            let binary = "";
            for (let i = 0; i < bytes.length; i += 8192)
              binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
            originalBase64 = btoa(binary);
          }
          return { ...rest, originalBase64 };
        }),
      ),
    })),
  );
  download(
    new Blob(
      [
        JSON.stringify({
          format: "folio-project",
          schemaVersion: 1,
          project: { ...project, sources },
        }),
      ],
      { type: "application/json" },
    ),
    `${project.name}.folio.json`,
  );
}
export async function restoreBackup(file: File): Promise<Project> {
  if (file.size > 150 * 1024 * 1024)
    throw new Error("备份过大 / Backup too large");
  const data = JSON.parse(await file.text());
  if (
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
  for (const s of p.sources) {
    if (
      typeof s.id !== "string" ||
      typeof s.name !== "string" ||
      !Array.isArray(s.versions) ||
      !s.versions.length
    )
      throw new Error("资料结构无效 / Invalid source");
    for (const v of s.versions) {
      if (
        typeof v.text !== "string" ||
        typeof v.id !== "string" ||
        !Array.isArray(v.pages)
      )
        throw new Error("资料版本无效 / Invalid version");
      if (v.originalBase64) {
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
