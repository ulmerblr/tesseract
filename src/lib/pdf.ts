// Reads the text of a PDF on this device with pdf.js (legacy worker bundled in public/pdfjs).

type TextItem = { str: string; transform: number[]; height: number; hasEOL?: boolean };

export async function extractPdfText(buf: ArrayBuffer): Promise<string> {
  // The legacy build runs on a wider range of browsers (the modern one needs very new JS).
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  // pdf.js takes ownership of the bytes, so give it a copy.
  const task = pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) });
  const doc = await task.promise;
  const pages: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = (content.items as TextItem[]).filter((i) => typeof i.str === "string" && i.str.trim());
      pages.push(linesFrom(items));
    }
  } finally {
    await task.destroy();
  }
  return pages.filter(Boolean).join("\n\n");
}

/** Rebuilds lines from positioned text, leaving a blank line where the page has a visible gap. */
function linesFrom(items: TextItem[]): string {
  type Line = { y: number; h: number; parts: { x: number; s: string }[] };
  const lines: Line[] = [];
  for (const it of items) {
    const x = it.transform[4];
    const y = it.transform[5];
    const h = it.height || Math.abs(it.transform[3]) || 10;
    const line = lines.find((l) => Math.abs(l.y - y) < Math.max(l.h, h) * 0.5);
    if (line) line.parts.push({ x, s: it.str });
    else lines.push({ y, h, parts: [{ x, s: it.str }] });
  }
  lines.sort((a, b) => b.y - a.y);
  const out: string[] = [];
  lines.forEach((l, i) => {
    if (i > 0) {
      const gap = lines[i - 1].y - l.y;
      if (gap > Math.max(lines[i - 1].h, l.h) * 1.9) out.push("");
    }
    out.push(
      l.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.s)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  });
  return out.join("\n");
}
