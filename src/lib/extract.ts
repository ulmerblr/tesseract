// Turns an uploaded file into rows (spreadsheets, CSV) or plain text (Word, PDF),
// entirely in the browser. SheetJS, mammoth and pdf.js are loaded only when needed.

export type Extracted =
  | { kind: "sheet"; fileName: string; rows: string[][]; text: string }
  | { kind: "word"; fileName: string; text: string }
  | { kind: "pdf"; fileName: string; text: string; bytes: ArrayBuffer };

export const ACCEPTED = ".xlsx,.xls,.csv,.docx,.pdf";

export async function extractFile(fileName: string, buf: ArrayBuffer): Promise<Extracted> {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    // mammoth ends every paragraph with a blank line; collapse that so blank
    // lines only mark the gaps the writer actually left.
    return { kind: "word", fileName, text: value.replace(/\n\n/g, "\n") };
  }
  if (ext === "pdf") {
    const { extractPdfText } = await import("./pdf");
    return { kind: "pdf", fileName, text: await extractPdfText(buf), bytes: buf };
  }
  if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    const XLSX = await import("xlsx");
    const wb =
      ext === "csv"
        ? XLSX.read(new TextDecoder().decode(buf), { type: "string", raw: true })
        : XLSX.read(new Uint8Array(buf), { type: "array" });
    const rows: string[][] = [];
    const texts: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
      const clean = sheetRows.map((r) => r.map((c) => String(c ?? "").trim()));
      if (!clean.some((r) => r.some(Boolean))) continue;
      if (rows.length) rows.push([]);
      rows.push(...clean);
      texts.push((wb.SheetNames.length > 1 ? `# Sheet: ${name}\n` : "") + XLSX.utils.sheet_to_csv(sheet));
    }
    return { kind: "sheet", fileName, rows, text: texts.join("\n\n") };
  }
  throw new Error("That file type isn't supported. Use .xlsx, .csv, .docx or .pdf.");
}
