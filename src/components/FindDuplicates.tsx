"use client";

import { useMemo, useState } from "react";
import { useVault } from "./VaultProvider";
import { findDuplicateGroups, mergeGroup, type DuplicateGroup } from "@/lib/duplicates";
import type { Login } from "@/lib/types";

/** Groups of logins that look like the same account, side by side, to merge or dismiss. */
export function FindDuplicates({ onClose }: { onClose(): void }) {
  const { logins, dismissedDuplicates, replaceLogins, dismissDuplicates } = useVault();
  const groups = useMemo(() => findDuplicateGroups(logins, dismissedDuplicates), [logins, dismissedDuplicates]);
  const [merged, setMerged] = useState(0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black sm:text-4xl">Find Duplicates</h2>
          <p className="mt-1 text-muted">
            Same username and the same website (by main domain). Pick the password to keep; security questions, hints and notes
            from the others merge into it, and the copies are removed.
          </p>
        </div>
        <button className="btn-ghost" onClick={onClose}>Back to the vault</button>
      </div>

      {merged > 0 && (
        <p className="mt-6 rounded-xl bg-accent px-4 py-3 font-bold text-accent-ink">
          Merged {merged} group{merged === 1 ? "" : "s"}.
        </p>
      )}

      {groups.length === 0 ? (
        <div className="card mt-6 text-center">
          <p className="text-2xl font-black">No duplicates found.</p>
          <p className="mt-2 text-muted">Every login in the vault looks like a different account.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6">
          {groups.map((g) => (
            <GroupCard
              key={g.key}
              group={g}
              onMerge={async (keepId) => {
                await replaceLogins(mergeGroup(logins, g.logins, keepId));
                setMerged((n) => n + 1);
              }}
              onDismiss={() => dismissDuplicates(g.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupCard({ group, onMerge, onDismiss }: { group: DuplicateGroup; onMerge(keepId: string): Promise<void>; onDismiss(): void }) {
  const newest = [...group.logins].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const [keepId, setKeepId] = useState(newest.id);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <section className={`card ${group.kind === "possible" ? "border-warn" : "border-accent"}`} aria-label="Duplicate group">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-md px-2 py-1 text-xs font-black tracking-wider ${group.kind === "possible" ? "bg-warn text-ink" : "bg-accent text-accent-ink"}`}>
          {group.kind === "possible" ? "POSSIBLE DUPLICATES" : "DUPLICATES"}
        </span>
        <span className="font-bold">
          {group.logins.length} logins for <span className="break-all">{group.logins[0].username}</span>
        </span>
        <button className="ml-auto text-sm font-bold text-accent underline" onClick={() => setShow((s) => !s)}>
          {show ? "Hide passwords" : "Show passwords"}
        </button>
      </div>
      {group.kind === "possible" && (
        <p className="mt-2 text-sm text-muted">One of these has no website, so these are matched by username and a similar name only.</p>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {group.logins.map((l) => (
          <label
            key={l.id}
            className={`block cursor-pointer rounded-xl border-2 p-4 ${keepId === l.id ? "border-accent bg-panel-2" : "border-line"}`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name={`keep-${group.key}`}
                className="mt-1 h-5 w-5 accent-[#18c2ff]"
                checked={keepId === l.id}
                onChange={() => setKeepId(l.id)}
              />
              <LoginSummary login={l} show={show} />
            </div>
            <div className="mt-2 text-xs font-bold text-muted uppercase">{keepId === l.id ? "Keep this password" : "Use this password"}</div>
          </label>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          className="btn-accent"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onMerge(keepId);
          }}
        >
          Merge
        </button>
        <button className="btn-ghost" onClick={onDismiss}>Not duplicates</button>
      </div>
    </section>
  );
}

function LoginSummary({ login, show }: { login: Login; show: boolean }) {
  return (
    <div className="min-w-0 flex-1 text-sm">
      <div className="text-lg font-black break-words">{login.site || login.url || "Untitled"}</div>
      {login.url && <div className="break-all text-muted">{login.url}</div>}
      <div className="mt-2 font-mono break-all">{login.username}</div>
      <div className="font-mono break-all">{login.password ? (show ? login.password : "•".repeat(Math.min(login.password.length, 14))) : "(no password)"}</div>
      {login.questions.length > 0 && <div className="mt-2">{login.questions.length} security question{login.questions.length === 1 ? "" : "s"}</div>}
      {login.hints.map((h, i) => <div key={`h${i}`} className="text-muted">Hint: {h}</div>)}
      {login.notes.map((n, i) => <div key={`n${i}`} className="text-muted">Note: {n}</div>)}
    </div>
  );
}
