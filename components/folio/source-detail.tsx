"use client";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Plus,
  Upload,
  Download,
  AlertCircle,
  Maximize2,
  BookmarkPlus,
} from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { download } from "@/lib/folio/files";
import type {
  Source,
  Language,
  SourceVersion,
  ReadingPosition,
} from "@/lib/folio/model";
import PdfReader from "./pdf-reader";

export default function SourceDetail({
  source,
  quote,
  versionId,
  language,
  onBack,
  onUpdate,
  onCite,
  onCapture,
  initialPage = 1,
  onPosition,
  expanded = false,
  backLabel,
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
  onCapture?: (
    source: Source,
    version: SourceVersion,
    page: number,
    quote: string,
  ) => void;
  initialPage?: number;
  onPosition?: (position: ReadingPosition) => void;
  expanded?: boolean;
  backLabel?: string;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [selected, setSelected] = useState(
    versionId || source.versions.at(-1)!.id,
  );
  const version =
    source.versions.find((v) => v.id === selected) || source.versions.at(-1)!;
  const [page, setPage] = useState(initialPage);
  const [large, setLarge] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<string | null>(null);
  const showPreview = previewVersion === version.id;
  const current =
    version.pages.find((p) => p.page === page) || version.pages[0];
  const quotedPage = version.pages.find((p) => quote && p.text.includes(quote));
  const isPdf = (version.kind || source.kind) === "pdf" && !!version.original;
  const move = (next: number) => {
    const safe = Math.max(1, Math.min(version.pages.length, Math.floor(next)));
    setPage(safe);
    onPosition?.({
      sourceId: source.id,
      versionId: version.id,
      page: safe,
      quote,
    });
  };
  useEffect(() => {
    setPage(Math.min(initialPage, version.pages.length));
  }, [version.id, quote]);
  const pagination = (
    <div className="reader-pagination">
      <button
        aria-label={t("上一页", "Previous page")}
        disabled={current.page <= 1}
        onClick={() => move(current.page - 1)}
      >
        <ArrowLeft size={16} />
      </button>
      <label>
        {t("页码", "Page")}
        <input
          aria-label={t("页码", "Page number")}
          type="number"
          min={1}
          max={version.pages.length}
          value={current.page}
          onChange={(e) => {
            if (e.target.value) move(Number(e.target.value));
          }}
        />
      </label>
      <span>/ {version.pages.length}</span>
      <button
        aria-label={t("下一页", "Next page")}
        disabled={current.page >= version.pages.length}
        onClick={() => move(current.page + 1)}
      >
        <ArrowRight size={16} />
      </button>
    </div>
  );
  return (
    <>
      <button className="back-source" onClick={onBack}>
        <ArrowLeft size={14} />
        {backLabel || t("返回资料", "Back to sources")}
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
        <Select
          value={version.id}
          onValueChange={(id) => {
            setSelected(id);
            setPage(1);
            onPosition?.({
              sourceId: source.id,
              versionId: id,
              page: 1,
              quote: "",
            });
          }}
        >
          <SelectTrigger aria-label={t("资料版本", "Source version")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {source.versions.map((v, i) => (
              <SelectItem key={v.id} value={v.id}>
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
          {t(
            "正在查看早期版本，原始证据仍然保留。",
            "Earlier version. Its original evidence is preserved.",
          )}
        </div>
      )}
      {quote && (
        <div className="quoted-evidence">
          <span>{t("待核对的原文", "PASSAGE TO VERIFY")}</span>
          <p>{quote}</p>
          {quotedPage && quotedPage.page !== current.page && (
            <button
              className="text-action"
              onClick={() => move(quotedPage.page)}
            >
              {t("回到引用页", "Return to cited page")} {quotedPage.page}
            </button>
          )}
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
      {pagination}
      {isPdf && (
        <>
          <div className="reader-heading">
            <span>{t("原始页面", "Original page")}</span>
            {!expanded && (
              <button onClick={() => setLarge(true)}>
                <Maximize2 size={15} />
                {t("展开阅读", "Expand reader")}
              </button>
            )}
          </div>
          {!large && showPreview && (
            <PdfReader
              file={version.original!}
              page={current.page}
              quote={quote}
              language={language}
            />
          )}
          {!large && !showPreview && (
            <button
              className="secondary-button"
              onClick={() => setPreviewVersion(version.id)}
            >
              <FileText size={15} />
              {t("加载 PDF 预览", "Load PDF preview")}
            </button>
          )}
          {!large && showPreview && (
            <button
              className="text-action"
              onClick={() => setPreviewVersion(null)}
            >
              {t("关闭预览，释放资源", "Close preview and free resources")}
            </button>
          )}
        </>
      )}
      <div className="source-page">
        <div className="source-page-heading">
          {isPdf
            ? t("提取文字 · 第 ", "Extracted text · Page ")
            : t("第 ", "Page / section ")}
          {current.page}
        </div>
        {current.text
          .split(/\n\s*\n/)
          .filter((p) => p.trim())
          .map((p, i) => {
            const offset = quote ? p.indexOf(quote) : -1;
            return (
              <div className="source-paragraph" key={i}>
                <p>
                  {offset >= 0 ? (
                    <>
                      {p.slice(0, offset)}
                      <mark>{quote}</mark>
                      {p.slice(offset + quote.length)}
                    </>
                  ) : (
                    p
                  )}
                </p>
                <div className="source-passage-actions">
                  {onCapture && (
                    <button
                      onClick={() =>
                        onCapture(source, version, current.page, p)
                      }
                    >
                      <BookmarkPlus size={14} />
                      {t("保存发现", "Keep finding")}
                    </button>
                  )}
                  <button
                    title={t("引用到正文", "Cite in document")}
                    onClick={() => onCite(source, version, current.page, p)}
                  >
                    <Plus size={12} />
                    {t("引用", "Cite")}
                  </button>
                </div>
              </div>
            );
          })}
      </div>
      {!expanded && (
        <Dialog open={large} onOpenChange={setLarge}>
          <DialogContent className="evidence-dialog">
            <DialogHeader>
              <DialogTitle>{source.name}</DialogTitle>
              <DialogDescription>
                {t(
                  "核对原始页面与引用。",
                  "Check the original page against the cited passage.",
                )}
              </DialogDescription>
            </DialogHeader>
            {pagination}
            {large && isPdf && (
              <PdfReader
                file={version.original!}
                page={current.page}
                quote={quote}
                language={language}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
