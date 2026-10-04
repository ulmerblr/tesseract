"use client";

import { useEffect, useRef, useState } from "react";
import { useHydrated } from "@/lib/useHydrated";
import Link from "next/link";
import { useVault } from "@/components/VaultProvider";
import { Page, RequireUnlocked } from "@/components/RequireUnlocked";
import { ImportPreview } from "@/components/ImportPreview";
import type { ImportResult } from "@/lib/duplicates";
import { ACCEPTED, extractFile, type Extracted } from "@/lib/extract";
import { readSheet, readWord } from "@/lib/simulated";
import { getApiKey, getModel, MODELS } from "@/lib/settings";
import { newId, type DraftLogin } from "@/lib/types";

const SAMPLES = [
  { file: "messy-passwords.xlsx", title: "Messy Excel sheet", body: "Odd column headers, a title row, blank rows, a mystery column." },
  { file: "google-passwords.csv", title: "Google Password Manager CSV", body: "The name, url, username, password, note export format." },
  { file: "password-notes.docx", title: "Messy Word notes", body: "Typed the way a real person keeps notes. Includes an unsure password." },
  { file: "printed-password-list.pdf", title: "Printed list (PDF)", body: "A list someone typed up and printed. One account appears twice with a newer password." },
];

type Step =
  | { kind: "pick" }
  | { kind: "reading"; fileName: string }
  | { kind: "preview"; fileName: string; drafts: DraftLogin[]; isSample: boolean }
  | { kind: "done"; fileName: string; result: ImportResult; isSample: boolean };

type ApiLogin = {
  site: string;
  url: string;
  username: string;
  password: string;
  hints: string[];
  securityQuestions: { question: string; answer: string }[];
  notes: string[];
  uncertain: boolean;
  uncertainReason: string;
};

export default function ImportPage() {
  return (
    <RequireUnlocked>
      <Importer />
    </RequireUnlocked>
  );
}

function Importer() {
  const { setAutoLockPaused } = useVault();
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);

  // Don't auto-lock (and lose the preview) while rows are waiting to be imported.
  const pending = step.kind === "preview" && step.drafts.length > 0;
  useEffect(() => {
    setAutoLockPaused(pending);
    return () => setAutoLockPaused(false);
  }, [pending, setAutoLockPaused]);
  const hydrated = useHydrated();
  const modelId = hydrated ? getModel() : "";
  const realReader = { on: hydrated && Boolean(getApiKey()), model: MODELS.find((m) => m.id === modelId)?.label ?? modelId };
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function read(fileName: string, buf: ArrayBuffer, isSample: boolean) {
    setError(null);
    setStep({ kind: "reading", fileName });
    const apiKey = getApiKey();
    let extracted: Extracted;
    try {
      extracted = await extractFile(fileName, buf);
    } catch (err) {
      setError({ title: `Couldn't open ${fileName}`, detail: err instanceof Error ? err.message : "The file couldn't be read." });
      setStep({ kind: "pick" });
      return;
    }
    try {
      const drafts = apiKey ? await readWithClaude(extracted, apiKey) : readSimulated(extracted);
      if (!drafts.length) {
        setError({ title: "No logins found", detail: `Nothing that looks like a login was found in ${fileName}.` });
        setStep({ kind: "pick" });
        return;
      }
      setStep({ kind: "preview", fileName, drafts, isSample });
    } catch (err) {
      if (err instanceof ScannedPdfError) {
        setError({ title: "Scanned PDF", detail: err.message });
        setStep({ kind: "pick" });
        return;
      }
      setError({
        title: `Claude (${realReader.model}) couldn't read ${fileName}`,
        detail: err instanceof Error ? err.message : "The request failed.",
      });
      setStep({ kind: "pick" });
    }
  }

  async function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await read(file.name, await file.arrayBuffer(), false);
  }

  async function loadSample(file: string) {
    const res = await fetch(`/samples/${file}`);
    await read(file, await res.arrayBuffer(), true);
  }

  if (step.kind === "done") {
    return (
      <Page>
        <div className="font-mono text-sm font-bold text-accent">IMPORT COMPLETE</div>
        <h1 className="display-title mt-2">
          {step.result.added} new login{step.result.added === 1 ? "" : "s"} added.
        </h1>
        <p className="mt-3 text-lg text-muted">
          {step.result.updated} saved login{step.result.updated === 1 ? "" : "s"} updated · {step.result.skipped} skipped, already saved.
        </p>
        <div className="mt-8 rounded-2xl border-4 border-warn bg-warn/10 p-6">
          <div className="text-2xl font-black text-warn uppercase sm:text-3xl">Now delete the original file.</div>
          <p className="mt-3 text-lg">
            <b className="break-all">{step.fileName}</b> still has every password in plain, readable text. Delete it, then empty
            your Trash or Recycle Bin, and remove any copies in email, downloads or cloud folders.
          </p>
          {step.isSample && <p className="mt-3 text-muted">(This one was a built-in fake sample, so there is nothing to delete this time.)</p>}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/vault" className="btn-accent text-lg">Open the vault →</Link>
          <button className="btn-ghost" onClick={() => setStep({ kind: "pick" })}>Import another file</button>
        </div>
      </Page>
    );
  }

  if (step.kind === "preview") {
    return (
      <Page wide>
        <ImportPreview
          fileName={step.fileName}
          drafts={step.drafts}
          onDraftsChange={(drafts) => setStep({ ...step, drafts })}
          badge={<ReaderBadge realReader={realReader} />}
          onCancel={() => setStep({ kind: "pick" })}
          onDone={(result) => setStep({ kind: "done", fileName: step.fileName, result, isSample: step.isSample })}
        />
      </Page>
    );
  }

  return (
    <Page wide>
      <ReaderBadge realReader={realReader} />
      <h1 className="display-title mt-4">Bring in your existing passwords</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">
        Excel, CSV, Word or PDF. The file is opened right here on this laptop.
        {realReader.on
          ? " Its text is sent once to Claude to be read, then you check every entry before anything is saved."
          : " Nothing is uploaded. You check every entry before anything is saved."}
      </p>

      {step.kind === "reading" ? (
        <div className="card mt-8 flex min-h-56 flex-col items-center justify-center text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-accent" />
          <p className="mt-4 text-xl font-black">Reading {step.fileName}…</p>
          {realReader.on && <p className="mt-1 text-muted">Claude can take up to a minute on messy files.</p>}
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void onFiles(e.dataTransfer.files);
          }}
          className={`mt-8 flex min-h-56 flex-col items-center justify-center rounded-3xl border-4 border-dashed p-8 text-center transition-colors ${
            dragging ? "border-accent bg-accent/10" : "border-line"
          }`}
        >
          <p className="text-2xl font-black sm:text-3xl">Drop a file here</p>
          <p className="mt-1 text-muted">.xlsx · .csv · .docx · .pdf</p>
          <button className="btn-accent mt-5" onClick={() => inputRef.current?.click()}>Choose a file</button>
          <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden" onChange={(e) => void onFiles(e.target.files)} />
        </div>
      )}

      {error && (
        <div role="alert" className="mt-6 rounded-2xl border-4 border-danger bg-danger/15 p-5">
          <div className="text-xl font-black text-danger">{error.title}</div>
          <p className="mt-1 text-lg font-bold">{error.detail}</p>
          {realReader.on && (
            <p className="mt-2 text-sm text-muted">
              Nothing was imported. You can try again, pick the other model on <Link href="/admin" className="underline">Admin</Link>, or clear
              the key there to use the simulated reader.
            </p>
          )}
        </div>
      )}

      <h2 className="mt-12 text-2xl font-black">Or try a sample (all fake)</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SAMPLES.map((s) => (
          <div key={s.file} className="card flex flex-col">
            <div className="font-mono text-xs text-muted">{s.file}</div>
            <div className="mt-1 text-xl font-black">{s.title}</div>
            <p className="mt-1 flex-1 text-muted">{s.body}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="btn-accent btn-sm" disabled={step.kind === "reading"} onClick={() => void loadSample(s.file)}>
                Load this sample
              </button>
              <a href={`/samples/${s.file}`} download className="text-sm font-bold text-muted underline hover:text-fg">
                Download
              </a>
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}

function ReaderBadge({ realReader }: { realReader: { on: boolean; model: string } }) {
  return realReader.on ? (
    <div className="inline-block rounded-xl border-2 border-warn bg-warn/10 px-4 py-2">
      <div className="text-lg font-black tracking-wide text-warn uppercase">
        DEMO: READING USES CLAUDE ONLINE <span className="text-sm font-bold normal-case opacity-70">· {realReader.model}</span>
      </div>
      <div className="text-sm font-bold">The finished Tesseract reads files on your laptop. Nothing leaves it.</div>
    </div>
  ) : (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-accent px-4 py-2 text-lg font-black tracking-wide text-accent-ink uppercase">
      READING ON THIS LAPTOP
    </div>
  );
}

const SCANNED_PDF = "This PDF is a scanned image. It can be read when Claude reading is on.";

function readSimulated(ex: Extracted): DraftLogin[] {
  if (ex.kind === "sheet") return readSheet(ex.rows);
  if (ex.kind === "pdf" && !ex.text.trim()) throw new ScannedPdfError(SCANNED_PDF);
  return readWord(ex.text);
}

class ScannedPdfError extends Error {}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function readWithClaude(ex: Extracted, apiKey: string): Promise<DraftLogin[]> {
  const res = await fetch("/api/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      ex.kind === "pdf"
        ? { apiKey, model: getModel(), kind: "pdf", pdf: toBase64(ex.bytes) }
        : { apiKey, model: getModel(), text: ex.text, kind: ex.kind },
    ),
  });
  const data = (await res.json().catch(() => ({}))) as { logins?: ApiLogin[]; error?: string };
  if (!res.ok || !data.logins) throw new Error(data.error ?? `Claude reading failed (${res.status}).`);
  return data.logins.map((l) => ({
    key: newId(),
    site: l.site,
    url: l.url,
    username: l.username,
    password: l.password,
    hints: l.hints,
    questions: l.securityQuestions,
    notes: l.notes,
    flagged: l.uncertain,
    flagReason: l.uncertainReason,
  }));
}
