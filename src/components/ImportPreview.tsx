"use client";

import { useMemo, useState } from "react";
import { useVault } from "./VaultProvider";
import { LoginEditor, cleanFields } from "./LoginEditor";
import { applyImport, planImport, type DraftPlan, type ImportResult } from "@/lib/duplicates";
import { newId, type DraftLogin } from "@/lib/types";

type Props = {
  fileName: string;
  drafts: DraftLogin[];
  onDraftsChange(drafts: DraftLogin[]): void;
  badge: React.ReactNode;
  onCancel(): void;
  onDone(result: ImportResult): void;
};

/** The import preview: every row editable, with duplicates found and resolved before anything is saved. */
export function ImportPreview({ fileName, drafts, onDraftsChange, badge, onCancel, onDone }: Props) {
  const { logins, replaceLogins } = useVault();
  const [choices, setChoices] = useState<Map<string, "keep" | "update">>(new Map());
  const [sameAccount, setSameAccount] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const plans = useMemo(() => planImport(drafts, logins, sameAccount), [drafts, logins, sameAccount]);
  const rowNo = new Map(drafts.map((d, i) => [d.key, i + 1]));
  const count = (s: DraftPlan["status"]) => drafts.filter((d) => plans.get(d.key)?.status === s).length;
  const conflicts = drafts.filter((d) => plans.get(d.key)?.status === "conflict");
  const undecided = conflicts.filter((d) => !choices.has(d.key)).length;
  const flagged = drafts.filter((d) => d.flagged && plans.get(d.key)?.status !== "skip").length;
  const newCount = count("new") + count("possible");

  const setChoice = (key: string, c: "keep" | "update") => setChoices(new Map(choices).set(key, c));
  const toggleSame = (key: string, on: boolean) => {
    const next = new Set(sameAccount);
    if (on) next.add(key);
    else next.delete(key);
    setSameAccount(next);
  };

  async function importAll() {
    setBusy(true);
    const result = applyImport(drafts, plans, choices, logins, cleanFields, newId);
    await replaceLogins(result.logins);
    onDone(result);
  }

  return (
    <>
      {badge}
      <h1 className="display-title mt-4">Check what we found</h1>
      <p className="mt-3 text-lg text-muted">
        <b className="text-fg">{drafts.length}</b> login{drafts.length === 1 ? "" : "s"} in <b className="break-all text-fg">{fileName}</b>:{" "}
        <b className="text-fg">{newCount} new</b>
        {count("skip") > 0 && <> · {count("skip")} already saved</>}
        {conflicts.length > 0 && <> · <b className="text-warn">{conflicts.length} with a different password</b></>}
        {count("possible") > 0 && <> · <b className="text-warn">{count("possible")} possible duplicate{count("possible") === 1 ? "" : "s"}</b></>}
        {flagged > 0 && <> · <b className="text-warn">{flagged} flagged</b></>}. Everything is editable.
      </p>

      <div className="mt-8 grid gap-5 pb-32">
        {drafts.map((d, i) => {
          const plan = plans.get(d.key) ?? { status: "new" as const };
          const remove = () => onDraftsChange(drafts.filter((x) => x.key !== d.key));
          const edit = (f: Partial<DraftLogin>) => onDraftsChange(drafts.map((x) => (x.key === d.key ? { ...x, ...f } : x)));
          const where =
            plan.status === "skip" || plan.status === "conflict"
              ? plan.inFile && plan.target.kind === "draft"
                ? `ALREADY IN THIS FILE (row #${rowNo.get(plan.target.key)})`
                : "ALREADY IN YOUR VAULT"
              : null;

          if (plan.status === "skip") {
            return (
              <article key={d.key} className="card border-dashed opacity-80">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm text-muted">#{i + 1}</span>
                  <DupTag text={where!} />
                  <span className="text-lg font-black">{d.site || d.url}</span>
                  <span className="text-muted">{d.username}</span>
                </div>
                <p className="mt-2 font-bold">Skipped, already saved.</p>
                <p className="text-sm text-muted">
                  Same password as “{plan.targetName}”. Any security questions, hints or notes it has that the saved one doesn&apos;t
                  will be added to it.
                </p>
                {sameAccount.has(d.key) && (
                  <button className="mt-2 text-sm font-bold text-accent underline" onClick={() => toggleSame(d.key, false)}>
                    Not the same account
                  </button>
                )}
              </article>
            );
          }

          return (
            <article key={d.key} className={`card ${plan.status !== "new" || d.flagged ? "border-warn" : ""}`}>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm text-muted">#{i + 1}</span>
                  {where && <DupTag text={where} />}
                  {plan.status === "possible" && <DupTag text="POSSIBLE DUPLICATE" />}
                  <h2 className="text-2xl font-black">{d.site || d.url || "Untitled"}</h2>
                </div>
                <button className="btn-danger btn-sm" onClick={remove} aria-label={`Remove ${d.site || "this row"}`}>
                  Remove
                </button>
              </div>

              {plan.status === "conflict" && (
                <div className="mb-5 rounded-xl border-2 border-warn p-4">
                  <p className="font-bold">
                    “{plan.targetName}” is saved with a different password. Which one should Tesseract keep?
                  </p>
                  <PasswordPair current={plan.targetPassword} incoming={d.password} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ChoiceButton active={choices.get(d.key) === "keep"} onClick={() => setChoice(d.key, "keep")}>
                      Keep current
                    </ChoiceButton>
                    <ChoiceButton active={choices.get(d.key) === "update"} onClick={() => setChoice(d.key, "update")}>
                      Update to this one
                    </ChoiceButton>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    Either way, its security questions, hints and notes are added to the saved login. Updating keeps the old password
                    in the notes with today&apos;s date.
                  </p>
                  {sameAccount.has(d.key) && (
                    <button className="mt-2 text-sm font-bold text-accent underline" onClick={() => toggleSame(d.key, false)}>
                      Not the same account
                    </button>
                  )}
                </div>
              )}

              {plan.status === "possible" && (
                <div className="mb-5 rounded-xl border-2 border-warn p-4">
                  <p className="font-bold">
                    Might be the same account as “{plan.targetName}”: same username and a similar name, but one has no website, so
                    Tesseract won&apos;t decide.
                  </p>
                  <p className="mt-1 text-sm text-muted">Unless you say otherwise it will be added as a new login.</p>
                  <button className="btn-ghost btn-sm mt-3" onClick={() => toggleSame(d.key, true)}>
                    It&apos;s the same account
                  </button>
                </div>
              )}

              {d.flagged && (
                <div className="mb-5 rounded-xl bg-warn px-4 py-3 font-bold text-ink">
                  ⚠ Not sure about this one{d.flagReason ? `: ${d.flagReason}` : ""}. Please check it.
                </div>
              )}
              <LoginEditor idPrefix={d.key} value={d} onChange={edit} />
            </article>
          );
        })}
        {drafts.length === 0 && <p className="text-center text-muted">Every row was removed.</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <button className="btn-accent text-lg" disabled={busy || drafts.length === 0 || undecided > 0} onClick={() => void importAll()}>
            Import All ({newCount} new{conflicts.length ? `, ${conflicts.length} to update or keep` : ""})
          </button>
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          {undecided > 0 && (
            <span className="font-bold text-warn">
              Choose Keep current or Update for {undecided} login{undecided === 1 ? "" : "s"} first.
            </span>
          )}
        </div>
      </div>
    </>
  );
}

function DupTag({ text }: { text: string }) {
  return <span className="rounded-md bg-warn px-2 py-1 text-xs font-black tracking-wider text-ink">{text}</span>;
}

function ChoiceButton({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button className={active ? "btn-accent btn-sm" : "btn-ghost btn-sm"} aria-pressed={active} onClick={onClick}>
      {active ? "✓ " : ""}
      {children}
    </button>
  );
}

function PasswordPair({ current, incoming }: { current: string; incoming: string }) {
  const [show, setShow] = useState(false);
  const mask = (p: string) => (p ? (show ? p : "•".repeat(Math.min(p.length, 14))) : "(none)");
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
      <span className="label mb-0">Saved now</span>
      <span className="font-mono break-all">{mask(current)}</span>
      <span className="label mb-0">In this file</span>
      <span className="font-mono break-all">{mask(incoming)}</span>
      <button className="text-left text-sm font-bold text-accent underline sm:col-span-2" onClick={() => setShow((s) => !s)}>
        {show ? "Hide passwords" : "Show passwords"}
      </button>
    </div>
  );
}
