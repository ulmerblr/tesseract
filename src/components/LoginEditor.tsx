"use client";

import { useState } from "react";
import type { LoginFields, SecurityQA } from "@/lib/types";
import { strongPassword } from "@/lib/password";

type Props = {
  value: LoginFields;
  onChange(next: LoginFields): void;
  idPrefix: string;
};

/** Every field of a login, all editable. Used by import preview, edit and "+ New". */
export function LoginEditor({ value, onChange, idPrefix }: Props) {
  const [show, setShow] = useState(false);
  const set = <K extends keyof LoginFields>(k: K, v: LoginFields[K]) => onChange({ ...value, [k]: v });
  const id = (s: string) => `${idPrefix}-${s}`;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={id("site")}>Website</label>
          <input id={id("site")} className="field" value={value.site} onChange={(e) => set("site", e.target.value)} placeholder="Bramblewood Bank" />
        </div>
        <div>
          <label className="label" htmlFor={id("url")}>Web address</label>
          <input id={id("url")} className="field" value={value.url} onChange={(e) => set("url", e.target.value)} placeholder="bramblewoodbank.example" />
        </div>
        <div>
          <label className="label" htmlFor={id("user")}>Username</label>
          <input id={id("user")} className="field" autoComplete="off" value={value.username} onChange={(e) => set("username", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor={id("pw")}>Password</label>
          <div className="flex gap-2">
            <input
              id={id("pw")}
              className="field font-mono"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={value.password}
              onChange={(e) => set("password", e.target.value)}
            />
            <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setShow((s) => !s)}>
              {show ? "Hide" : "Show"}
            </button>
          </div>
          <button
            type="button"
            className="mt-2 text-sm font-bold text-accent hover:underline"
            onClick={() => {
              set("password", strongPassword());
              setShow(true);
            }}
          >
            Generate a strong one
          </button>
        </div>
      </div>

      <ListEditor
        label="Hints"
        items={value.hints}
        onChange={(v) => set("hints", v)}
        addLabel="+ Hint"
        placeholder="e.g. flowers + year we moved"
      />

      <div>
        <div className="label">Security questions</div>
        <div className="grid gap-3">
          {value.questions.map((qa, i) => (
            <div key={i} className="grid gap-2 rounded-xl border-2 border-line p-3 sm:grid-cols-[1fr_1fr_auto]">
              <input
                aria-label={`Question ${i + 1}`}
                className="field"
                placeholder="Question"
                value={qa.question}
                onChange={(e) => set("questions", replaceAt(value.questions, i, { ...qa, question: e.target.value }))}
              />
              <input
                aria-label={`Answer ${i + 1}`}
                className="field"
                placeholder="Answer"
                value={qa.answer}
                onChange={(e) => set("questions", replaceAt(value.questions, i, { ...qa, answer: e.target.value }))}
              />
              <button type="button" className="btn-ghost btn-sm" onClick={() => set("questions", value.questions.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost btn-sm justify-self-start"
            onClick={() => set("questions", [...value.questions, { question: "", answer: "" } satisfies SecurityQA])}
          >
            + Security question
          </button>
        </div>
      </div>

      <ListEditor label="Notes" items={value.notes} onChange={(v) => set("notes", v)} addLabel="+ Note" placeholder="Anything else" multiline />
    </div>
  );
}

function replaceAt<T>(arr: T[], i: number, v: T): T[] {
  return arr.map((x, j) => (j === i ? v : x));
}

function ListEditor({
  label,
  items,
  onChange,
  addLabel,
  placeholder,
  multiline = false,
}: {
  label: string;
  items: string[];
  onChange(v: string[]): void;
  addLabel: string;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="grid gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            {multiline ? (
              <textarea
                aria-label={`${label} ${i + 1}`}
                className="field min-h-12"
                rows={2}
                value={item}
                placeholder={placeholder}
                onChange={(e) => onChange(replaceAt(items, i, e.target.value))}
              />
            ) : (
              <input
                aria-label={`${label} ${i + 1}`}
                className="field"
                value={item}
                placeholder={placeholder}
                onChange={(e) => onChange(replaceAt(items, i, e.target.value))}
              />
            )}
            <button type="button" className="btn-ghost btn-sm shrink-0 self-start" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn-ghost btn-sm justify-self-start" onClick={() => onChange([...items, ""])}>
          {addLabel}
        </button>
      </div>
    </div>
  );
}

/** Drops blank hints, notes and questions before saving. */
export function cleanFields(f: LoginFields): LoginFields {
  return {
    site: f.site.trim(),
    url: f.url.trim(),
    username: f.username.trim(),
    password: f.password,
    hints: f.hints.map((h) => h.trim()).filter(Boolean),
    questions: f.questions
      .map((q) => ({ question: q.question.trim(), answer: q.answer.trim() }))
      .filter((q) => q.question || q.answer),
    notes: f.notes.map((n) => n.trim()).filter(Boolean),
  };
}
