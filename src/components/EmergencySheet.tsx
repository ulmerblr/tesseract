"use client";

import type { Login } from "@/lib/types";

export type SheetData = { logins: Login[]; masterPassword: string; printedAt: Date };

function fmt(d: Date) {
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/** The printed sheet itself. Rendered only while printing, never stored. */
export function EmergencySheet({ data }: { data: SheetData }) {
  const printed = fmt(data.printedAt);
  const css = `@page { size: auto; margin: 0.6in 0.6in 0.75in;
    @bottom-left { content: "Printed ${printed.replace(/"/g, "")}"; font: 9pt Arial, sans-serif; color: #000; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 9pt Arial, sans-serif; color: #000; } }`;
  return (
    <div className="sheet">
      <style>{css}</style>
      <header style={{ borderBottom: "3pt solid #000", paddingBottom: "8pt", marginBottom: "12pt" }}>
        <div style={{ fontSize: "20pt", fontWeight: 900, letterSpacing: "0.04em" }}>TESSERACT EMERGENCY SHEET</div>
        <div style={{ marginTop: "4pt" }}>
          Printed {printed} · {data.logins.length} login{data.logins.length === 1 ? "" : "s"} on this sheet
        </div>
        <div style={{ marginTop: "4pt", fontWeight: 700 }}>Anyone holding this paper has your passwords. Keep it locked up.</div>
      </header>

      {data.masterPassword && (
        <div className="sheet-entry" style={{ border: "3pt solid #000", padding: "10pt 12pt", marginBottom: "12pt" }}>
          <div style={{ fontSize: "10pt", fontWeight: 700, letterSpacing: "0.08em" }}>TESSERACT MASTER PASSWORD</div>
          <div className="sheet-mono" style={{ fontSize: "16pt", fontWeight: 700, marginTop: "4pt", wordBreak: "break-all" }}>
            {data.masterPassword}
          </div>
        </div>
      )}

      {data.logins.map((l) => (
        <section key={l.id} className="sheet-entry">
          <div style={{ fontSize: "13pt", fontWeight: 800 }}>{l.site || l.url || "Untitled"}</div>
          <table style={{ borderCollapse: "collapse", width: "100%", marginTop: "3pt" }}>
            <tbody>
              {l.url && <Row label="Website">{l.url}</Row>}
              <Row label="Username" mono>{l.username || "—"}</Row>
              <Row label="Password" mono strong>{l.password || "—"}</Row>
              {l.questions.map((q, i) => (
                <Row key={`q${i}`} label={i === 0 ? "Security Q&A" : ""}>
                  {q.question} → <span className="sheet-mono">{q.answer}</span>
                </Row>
              ))}
              {l.hints.map((h, i) => (
                <Row key={`h${i}`} label={i === 0 ? "Hints" : ""}>{h}</Row>
              ))}
              {l.notes.map((n, i) => (
                <Row key={`n${i}`} label={i === 0 ? "Notes" : ""}>{n}</Row>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function Row({ label, children, mono, strong }: { label: string; children: React.ReactNode; mono?: boolean; strong?: boolean }) {
  return (
    <tr>
      <td style={{ width: "1.3in", verticalAlign: "top", fontSize: "9pt", fontWeight: 700, textTransform: "uppercase", paddingTop: "2pt" }}>{label}</td>
      <td
        className={mono ? "sheet-mono" : undefined}
        style={{ fontSize: mono ? "12pt" : "11pt", fontWeight: strong ? 700 : 400, wordBreak: "break-word", paddingTop: "1pt" }}
      >
        {children}
      </td>
    </tr>
  );
}
