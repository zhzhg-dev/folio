"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Language } from "@/lib/folio/model";
import { matchingPdfItems } from "@/lib/folio/pdf-text";
import { errorMessage } from "@/lib/folio/i18n";
import { pdfContainerWidth, pdfRenderSize } from "@/lib/folio/pdf-layout";

export default function PdfReader({
  file,
  page,
  quote,
  language,
}: {
  file: Blob;
  page: number;
  quote: string;
  language: Language;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(600);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [boxes, setBoxes] = useState<
    { x: number; y: number; width: number; height: number }[]
  >([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    setPdf(null);
    setError("");
    setBusy(true);
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (disposed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const data = await file.arrayBuffer();
      if (disposed) return;
      task = pdfjs.getDocument({ data });
      const document = await task.promise;
      if (!disposed) setPdf(document);
    })().catch((e) => {
      if (!disposed) {
        setError(errorMessage(e, language));
        setBusy(false);
      }
    });
    return () => {
      disposed = true;
      void task?.destroy();
    };
  }, [file]);
  useEffect(() => {
    if (!host.current) return;
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      const borderWidth =
        entry.borderBoxSize?.[0]?.inlineSize ??
        host.current?.getBoundingClientRect().width;
      if (!borderWidth) return;
      const next = pdfContainerWidth(borderWidth);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setWidth((previous) => (previous === next ? previous : next)),
      );
    });
    observer.observe(host.current, { box: "border-box" });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let cancelled = false;
    let render:
      ReturnType<import("pdfjs-dist").PDFPageProxy["render"]> | undefined;
    setBusy(true);
    setError("");
    setBoxes([]);
    (async () => {
      const p = await pdf.getPage(page);
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const layout = pdfRenderSize(
        width,
        base.width,
        base.height,
        zoom,
        window.devicePixelRatio || 1,
      );
      const viewport = p.getViewport({ scale: layout.scale });
      const target = canvas.current!;
      const ratio = layout.ratio;
      target.width = layout.pixelWidth;
      target.height = layout.pixelHeight;
      target.style.width = viewport.width + "px";
      target.style.height = viewport.height + "px";
      setSize({ width: viewport.width, height: viewport.height });
      render = p.render({
        canvas: target,
        viewport,
        transform: [ratio, 0, 0, ratio, 0, 0],
      });
      await render.promise;
      if (cancelled) return;
      if (!quote) {
        setBusy(false);
        return;
      }
      const content = await p.getTextContent();
      if (cancelled) return;
      const items = content.items.filter(
        (i): i is import("pdfjs-dist/types/src/display/api").TextItem =>
          "str" in i,
      );
      const matches = matchingPdfItems(items, quote);
      const { Util } = await import("pdfjs-dist");
      if (cancelled) return;
      setBoxes(
        items.flatMap((item, i) => {
          if (!matches.has(i) || !item.str.trim()) return [];
          const matrix = Util.transform(viewport.transform, item.transform);
          const height = Math.hypot(matrix[2], matrix[3]);
          return [
            {
              x: matrix[4],
              y: matrix[5] - height,
              width: Math.abs(item.width * viewport.scale),
              height: height * 1.18,
            },
          ];
        }),
      );
      setBusy(false);
    })().catch((e) => {
      if (!cancelled) {
        setError(errorMessage(e, language));
        setBusy(false);
      }
    });
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [pdf, page, width, zoom, quote]);
  return (
    <div className="pdf-reader">
      <div className="pdf-tools">
        <span>PDF · {t("原始页面", "Original page")}</span>
        <div>
          <button
            aria-label={t("缩小", "Zoom out")}
            disabled={zoom <= 0.75}
            onClick={() => setZoom((z) => Math.max(0.75, z - 0.25))}
          >
            <Minus size={15} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            aria-label={t("放大", "Zoom in")}
            disabled={zoom >= 2}
            onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div ref={host} className="pdf-viewport" aria-busy={busy}>
        {busy && (
          <span className="pdf-loading">
            <Loader2 size={18} className="spin" />
            {t("加载页面…", "Loading page…")}
          </span>
        )}
        <div
          className="pdf-sheet"
          style={{ width: size.width || "100%", height: size.height || 180 }}
        >
          <canvas
            ref={canvas}
            aria-label={t(`PDF 第 ${page} 页`, `PDF page ${page}`)}
          />
          {boxes.map((b, i) => (
            <span
              className="pdf-highlight"
              key={i}
              style={{ left: b.x, top: b.y, width: b.width, height: b.height }}
            />
          ))}
        </div>
      </div>
      {quote && !busy && !error && (
        <p className="reader-caption">
          {boxes.length
            ? t(
                "引用所在的文字行已标出。",
                "The text lines containing the passage are highlighted.",
              )
            : t(
                "此页未定位到原文，请在下方文字中核对。",
                "The passage could not be located on this page. Check the extracted text below.",
              )}
        </p>
      )}
    </div>
  );
}
