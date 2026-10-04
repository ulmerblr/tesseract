"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useVault } from "@/components/VaultProvider";
import { Page, RequireUnlocked } from "@/components/RequireUnlocked";
import { LoginEditor, cleanFields } from "@/components/LoginEditor";
import { emptyFields, type Login, type LoginFields } from "@/lib/types";

type Mode = { kind: "list" } | { kind: "view"; id: string } | { kind: "edit"; id: string } | { kind: "new" };

export default function VaultPage() {
  return (
    <RequireUnlocked>
      <Vault />
    </RequireUnlocked>
  );
}

function Vault() {
  const { logins } = useVault();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...logins].sort((a, b) => a.site.localeCompare(b.site, undefined, { sensitivity: "base" }));
    if (!q) return sorted;
    return sorted.filter((l) =>
      [l.site, l.url, l.username, ...l.notes, ...l.hints].some((s) => s.toLowerCase().includes(q)),
    );
  }, [logins, query]);

  const selected = "id" in mode ? logins.find((l) => l.id === mode.id) : undefined;
  const panelOpen = mode.kind !== "list";

  return (
    <Page wide>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display-title">Vault</h1>
          <p className="mt-2 text-muted">
            {logins.length} login{logins.length === 1 ? "" : "s"} · encrypted in this browser
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/import" className="btn-ghost">Import</Link>
          <button className="btn-accent" onClick={() => setMode({ kind: "new" })}>+ New</button>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className={panelOpen ? "hidden lg:block" : ""}>
          <input
            type="search"
            className="field text-lg"
            placeholder="Search websites, usernames, notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search the vault"
          />
          {logins.length === 0 ? (
            <div className="card mt-4 text-center">
              <p className="text-xl font-black">Your vault is empty.</p>
              <p className="mt-2 text-muted">Bring in passwords from a file, or add one by hand.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Link href="/import" className="btn-accent">Import passwords</Link>
                <button className="btn-ghost" onClick={() => setMode({ kind: "new" })}>+ New</button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <p className="mt-6 text-center text-muted">Nothing matches “{query}”.</p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {filtered.map((l) => {
                const active = "id" in mode && mode.id === l.id;
                return (
                  <li key={l.id}>
                    <button
                      onClick={() => setMode({ kind: "view", id: l.id })}
                      className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-colors ${
                        active ? "border-accent bg-panel-2" : "border-line bg-panel hover:border-fg"
                      }`}
                    >
                      <Monogram name={l.site || l.url} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-lg font-black">{l.site || l.url || "Untitled"}</div>
                        <div className="truncate text-sm text-muted">{l.username || "no username"}</div>
                      </div>
                      <span className="text-2xl text-muted">›</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={panelOpen ? "" : "hidden lg:block"}>
          {mode.kind === "list" && (
            <div className="card hidden h-full min-h-60 items-center justify-center text-center text-muted lg:flex">
              Pick a login to see everything saved for it.
            </div>
          )}
          {mode.kind === "view" && selected && (
            <LoginDetail login={selected} onBack={() => setMode({ kind: "list" })} onEdit={() => setMode({ kind: "edit", id: selected.id })} />
          )}
          {mode.kind === "edit" && selected && (
            <EditPanel
              title={`Edit ${selected.site || "login"}`}
              initial={selected}
              onCancel={() => setMode({ kind: "view", id: selected.id })}
              onSaved={() => setMode({ kind: "view", id: selected.id })}
              id={selected.id}
            />
          )}
          {mode.kind === "new" && (
            <EditPanel
              title="New login"
              initial={emptyFields()}
              onCancel={() => setMode({ kind: "list" })}
              onSaved={(id) => setMode({ kind: "view", id })}
            />
          )}
        </section>
      </div>
    </Page>
  );
}

function Monogram({ name }: { name: string }) {
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-fg text-2xl font-black text-ink">{letter}</div>
  );
}

function LoginDetail({ login, onBack, onEdit }: { login: Login; onBack(): void; onEdit(): void }) {
  const { copy, deleteLogin } = useVault();
  const [show, setShow] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copyError, setCopyError] = useState("");

  async function doCopy(text: string, label: string) {
    setCopyError("");
    try {
      await copy(text, label);
    } catch {
      setCopyError("This browser blocked clipboard access.");
    }
  }

  return (
    <div className="card">
      <button onClick={onBack} className="mb-4 text-sm font-bold text-muted hover:text-fg lg:hidden">‹ All logins</button>
      <div className="flex items-start gap-4">
        <Monogram name={login.site || login.url} />
        <div className="min-w-0 flex-1">
          <h2 className="text-3xl leading-tight font-black break-words">{login.site || "Untitled"}</h2>
          {login.url && <div className="mt-1 break-all text-muted">{login.url}</div>}
        </div>
      </div>

      <dl className="mt-6 grid gap-5">
        <Row label="Username">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 font-mono text-lg break-all">{login.username || "—"}</span>
            {login.username && (
              <button className="btn-ghost btn-sm" onClick={() => doCopy(login.username, "Username")}>Copy</button>
            )}
          </div>
        </Row>
        <Row label="Password">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 font-mono text-lg break-all">
              {login.password ? (show ? login.password : "•".repeat(Math.min(login.password.length, 16))) : "—"}
            </span>
            {login.password && (
              <>
                <button className="btn-ghost btn-sm" onClick={() => setShow((s) => !s)}>{show ? "Hide" : "Show"}</button>
                <button className="btn-accent btn-sm" onClick={() => doCopy(login.password, "Password")}>Copy</button>
              </>
            )}
          </div>
          {copyError && <p className="mt-2 text-sm font-bold text-danger">{copyError}</p>}
        </Row>
        {login.hints.length > 0 && (
          <Row label={login.hints.length > 1 ? "Hints" : "Hint"}>
            <ul className="grid gap-1">{login.hints.map((h, i) => <li key={i}>{h}</li>)}</ul>
          </Row>
        )}
        {login.questions.length > 0 && (
          <Row label="Security questions">
            <ul className="grid gap-3">
              {login.questions.map((q, i) => (
                <li key={i} className="rounded-xl bg-panel-2 p-3">
                  <div className="font-bold">{q.question || "(no question)"}</div>
                  <div className="mt-1 font-mono text-accent">{q.answer || "—"}</div>
                </li>
              ))}
            </ul>
          </Row>
        )}
        {login.notes.length > 0 && (
          <Row label="Notes">
            <ul className="grid gap-2">
              {login.notes.map((n, i) => <li key={i} className="whitespace-pre-wrap">{n}</li>)}
            </ul>
          </Row>
        )}
      </dl>

      <div className="mt-8 flex flex-wrap gap-2 border-t-2 border-line pt-5">
        <button className="btn-ghost" onClick={onEdit}>Edit</button>
        {confirming ? (
          <>
            <button
              className="btn-danger"
              onClick={async () => {
                await deleteLogin(login.id);
                onBack();
              }}
            >
              Yes, delete it
            </button>
            <button className="btn-ghost" onClick={() => setConfirming(false)}>Keep it</button>
          </>
        ) : (
          <button className="btn-danger" onClick={() => setConfirming(true)}>Delete</button>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function EditPanel({
  title,
  initial,
  id,
  onCancel,
  onSaved,
}: {
  title: string;
  initial: LoginFields;
  id?: string;
  onCancel(): void;
  onSaved(id: string): void;
}) {
  const { addLogins, updateLogin } = useVault();
  const [fields, setFields] = useState<LoginFields>(() => ({
    ...emptyFields(),
    ...initial,
    hints: [...initial.hints],
    questions: initial.questions.map((q) => ({ ...q })),
    notes: [...initial.notes],
  }));
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const clean = cleanFields(fields);
    if (!clean.site && !clean.url) return setError("Give it a website name or address.");
    if (id) {
      await updateLogin(id, clean);
      onSaved(id);
    } else {
      const [added] = await addLogins([clean]);
      onSaved(added.id);
    }
  }

  return (
    <form onSubmit={save} className="card">
      <h2 className="mb-6 text-3xl font-black">{title}</h2>
      <LoginEditor idPrefix={id ?? "new"} value={fields} onChange={setFields} />
      {error && <p className="mt-4 font-bold text-danger">{error}</p>}
      <div className="mt-8 flex gap-2 border-t-2 border-line pt-5">
        <button className="btn-accent">Save</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
