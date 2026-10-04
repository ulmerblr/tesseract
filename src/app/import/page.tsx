"use client";

import { useEffect, useRef, useState } from "react";
import { useHydrated } from "@/lib/useHydrated";
import Link from "next/link";
import { useVault } from "@/components/VaultProvider";
import { Page, RequireUnlocked } from "@/components/RequireUnlocked";
import { LoginEditor, cleanFields } from "@/components/LoginEditor";
import { ACCEPTED, extractFile, type Extracted } from "@/lib/extract";
import { readSheet, readWord } from "@/lib/simulated";
import { getApiKey, getModel, MODELS } from "@/lib/settings";
import { newId, type DraftLogin } from "@/lib/types";

const SAMPLES = [
  { file: "messy-passwords.xlsx", title: "Messy Excel sheet", body: "Odd column headers, a title row, blank rows, a mystery column." },
  { file: "google-passwords.csv", title: "Google Password Manager CSV", body: "The name, url, username, password, note export format." },
  { file: "password-notes.docx", title: "Messy Word notes", body: "Typed the way a real person keeps notes. Includes an unsure password." },
];

type Step =
  | { kind: "pick" }
  | { kind: "reading"; fileName: string }
  | { kind: "preview"; fileName: string; drafts: DraftLogin[]; isSample: boolean }
  | { kind: "done"; fileName: string; count: number; isSample: boolean };

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
  const { addLogins, setAutoLockPaused } = useVault();
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
          {step.count} login{step.count === 1 ? "" : "s"} now in your vault.
        </h1>
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
    const flagged = step.drafts.filter((d) => d.flagged).length;
    const update = (drafts: DraftLogin[]) => setStep({ ...step, drafts });
    return (
      <Page wide>
        <ReaderBadge realReader={realReader} />
        <h1 className="display-title mt-4">Check what we found</h1>
        <p className="mt-3 text-lg text-muted">
          <b className="text-fg">{step.drafts.length}</b> login{step.drafts.length === 1 ? "" : "s"} from{" "}
          <b className="break-all text-fg">{step.fileName}</b>
          {flagged > 0 && (
            <>
              {" "}· <b className="text-warn">{flagged} flagged</b> for a closer look
            </>
          )}
          . Everything is editable.
        </p>

        <div className="mt-8 grid gap-5 pb-28">
          {step.drafts.map((d, i) => (
            <article key={d.key} className={`card ${d.flagged ? "border-warn" : ""}`}>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-muted">#{i + 1}</span>
                  <h2 className="text-2xl font-black">{d.site || d.url || "Untitled"}</h2>
                </div>
                <button
                  className="btn-danger btn-sm"
                  onClick={() => update(step.drafts.filter((x) => x.key !== d.key))}
                  aria-label={`Remove ${d.site || "this row"}`}
                >
                  Remove
                </button>
              </div>
              {d.flagged && (
                <div className="mb-5 rounded-xl bg-warn px-4 py-3 font-bold text-ink">
                  ⚠ Not sure about this one{d.flagReason ? `: ${d.flagReason}` : ""}. Please check it.
                </div>
              )}
              <LoginEditor
                idPrefix={d.key}
                value={d}
                onChange={(f) => update(step.drafts.map((x) => (x.key === d.key ? { ...x, ...f } : x)))}
              />
            </article>
          ))}
          {step.drafts.length === 0 && <p className="text-center text-muted">Every row was removed.</p>}
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-ink/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
            <button
              className="btn-accent text-lg"
              disabled={step.drafts.length === 0}
              onClick={async () => {
                await addLogins(step.drafts.map((d) => cleanFields(d)));
                setStep({ kind: "done", fileName: step.fileName, count: step.drafts.length, isSample: step.isSample });
              }}
            >
              Import All ({step.drafts.length})
            </button>
            <button className="btn-ghost" onClick={() => setStep({ kind: "pick" })}>Cancel</button>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page wide>
      <ReaderBadge realReader={realReader} />
      <h1 className="display-title mt-4">Bring in your existing passwords</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">
        Excel, CSV or Word. The file is opened right here in your browser.
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
          <p className="mt-1 text-muted">.xlsx · .csv · .docx</p>
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
      <div className="mt-4 grid gap-4 md:grid-cols-3">
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
    <div className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-accent px-4 py-2 text-lg font-black tracking-wide text-accent-ink uppercase">
      Real Claude reading <span className="text-sm font-bold normal-case opacity-70">· {realReader.model}</span>
    </div>
  ) : (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border-2 border-warn px-4 py-2 text-lg font-black tracking-wide text-warn uppercase">
      Simulated reading
      <Link href="/admin" className="text-sm font-bold normal-case underline opacity-80">add a key on Admin</Link>
    </div>
  );
}

function readSimulated(ex: Extracted): DraftLogin[] {
  return ex.kind === "sheet" ? readSheet(ex.rows) : readWord(ex.text);
}

async function readWithClaude(ex: Extracted, apiKey: string): Promise<DraftLogin[]> {
  const res = await fetch("/api/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, model: getModel(), text: ex.text, kind: ex.kind }),
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
