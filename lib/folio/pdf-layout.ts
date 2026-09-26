// Use the container's border box, which does not shrink when a scrollbar appears.
export function pdfContainerWidth(borderWidth: number) {
  return Math.max(150, Math.min(1800, Math.floor(borderWidth) - 22));
}

export function pdfRenderSize(
  width: number,
  pageWidth: number,
  pageHeight: number,
  zoom: number,
  density: number,
) {
  if (
    ![width, pageWidth, pageHeight, zoom, density].every(Number.isFinite) ||
    pageWidth <= 0 ||
    pageHeight <= 0
  )
    throw new Error("Invalid PDF page dimensions");
  const scale = Math.min(
    (width / pageWidth) * Math.max(0.75, Math.min(2, zoom)),
    4096 / pageWidth,
    4096 / pageHeight,
  );
  const cssWidth = pageWidth * scale;
  const cssHeight = pageHeight * scale;
  const ratio = Math.min(
    Math.max(1, density),
    2,
    4096 / cssWidth,
    4096 / cssHeight,
    Math.sqrt(4_000_000 / (cssWidth * cssHeight)),
  );
  return {
    scale,
    ratio,
    pixelWidth: Math.max(1, Math.floor(cssWidth * ratio)),
    pixelHeight: Math.max(1, Math.floor(cssHeight * ratio)),
  };
}
