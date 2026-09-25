"use client";
import { useState } from "react";
import {
  ArrowLeft,
  FileText,
  Plus,
  Upload,
  Download,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { download } from "@/lib/folio/files";
import type { Source, Language, SourceVersion } from "@/lib/folio/model";
export default function SourceDetail({
  source,
  quote,
  versionId,
  language,
  onBack,
  onUpdate,
  onCite,
}: {
  source: Source;
  quote: string;
  versionId: string;
  language: Language;
  onBack: () => void;
  onUpdate: () => void;
  onCite: (
    source: Source,
    version: SourceVersion,
    page: number,
    quote: string,
  ) => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [selected, setSelected] = useState(
    versionId || source.versions.at(-1)!.id,
  );
  const version =
    source.versions.find((v) => v.id === selected) || source.versions.at(-1)!;
  return (
    <>
      <button className="back-source" onClick={onBack}>
        <ArrowLeft size={14} />
        {t("全部资料", "All sources")}
      </button>
      <div className="source-detail-title">
        <div className={`source-file-icon ${source.color}`}>
          <FileText size={22} />
        </div>
        <button className="secondary-button" onClick={onUpdate}>
          <Upload size={13} />
          {t("更新", "Update")}
        </button>
      </div>
      <h3>{source.name}</h3>
      <div className="source-version-row">
        <span className="source-meta">
          {(version.kind || source.kind).toUpperCase()} · {version.pages.length}{" "}
          {t("页 / 段", "pages / sections")}
        </span>
        <Select value={version.id} onValueChange={setSelected}>
          <SelectTrigger aria-label={t("资料版本", "Source version")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {source.versions.map((v, i) => (
              <SelectItem value={v.id} key={v.id}>
                v{i + 1}
                {i === source.versions.length - 1
                  ? t(" · 最新", " · Latest")
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {version.id !== source.versions.at(-1)!.id && (
        <div className="version-warning">
          <AlertCircle size={14} />
          {t("正在查看引用使用的旧版本", "Viewing an earlier source version")}
        </div>
      )}
      {quote && (
        <div className="quoted-evidence">
          <span>{t("引用原文", "Cited passage")}</span>
          <p>{quote}</p>
        </div>
      )}
      {version.original && (
        <button
          className="original-file"
          onClick={() =>
            download(version.original!, version.fileName || source.name)
          }
        >
          <Download size={13} />
          {t("下载这个版本的原文件", "Download this original file")}
        </button>
      )}
      {version.pages.map((page) => (
        <div className="source-page" key={page.page}>
          <div className="source-page-heading">
            {t("第 ", "Page ")}
            {page.page}
            {t(" 页 / 段", " / section")}
          </div>
          {page.text
            .split(/\n\s*\n/)
            .filter((p) => p.trim())
            .map((p, i) => (
              <div className="source-paragraph" key={i}>
                <p>{p}</p>
                <button
                  title={t("引用到正文光标处", "Cite at the document cursor")}
                  onClick={() => onCite(source, version, page.page, p)}
                >
                  <Plus size={12} />
                  {t("引用", "Cite")}
                </button>
              </div>
            ))}
        </div>
      ))}
    </>
  );
}
