"use client";

import { useState } from "react";
import { useHydrated } from "@/lib/useHydrated";
import { useRouter } from "next/navigation";
import { useVault } from "@/components/VaultProvider";
import { Page } from "@/components/RequireUnlocked";
import { getApiKey, getModel, maskKey, MODELS, setApiKey, setModel, type ModelId } from "@/lib/settings";

type TestState = { kind: "idle" } | { kind: "testing" } | { kind: "ok"; text: string } | { kind: "error"; text: string };

export default function AdminPage() {
  const { resetDemo } = useVault();
  const router = useRouter();
  const hydrated = useHydrated();
  const [keyOverride, setSavedKey] = useState<string | null>(null);
  const savedKey = keyOverride ?? (hydrated ? getApiKey() : "");
  const [draft, setDraft] = useState("");
  const [modelOverride, setModelState] = useState<ModelId | null>(null);
  const model = modelOverride ?? (hydrated ? getModel() : "claude-sonnet-5-5");
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [confirmReset, setConfirmReset] = useState(false);

  function save() {
    const k = draft.trim();
    if (!k) return;
    setApiKey(k);
    setSavedKey(k);
    setDraft("");
    setTest({ kind: "idle" });
  }

  function clear() {
    setApiKey("");
    setSavedKey("");
    setDraft("");
    setTest({ kind: "idle" });
  }

  async function runTest() {
    const key = draft.trim() || savedKey;
    if (!key) return setTest({ kind: "error", text: "Paste a key first." });
    setTest({ kind: "testing" });
    try {
      const res = await fetch("/api/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, model }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; model?: string; error?: string };
      if (data.ok) setTest({ kind: "ok", text: `Success. The key works with ${data.model ?? model}.` });
      else setTest({ kind: "error", text: data.error ?? `Failed (${res.status}).` });
    } catch {
      setTest({ kind: "error", text: "Couldn't reach the server." });
    }
  }

  return (
    <Page>
      <h1 className="display-title">Admin</h1>
      <p className="mt-3 text-lg text-muted">Settings for this browser only.</p>

      <section className="card mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-black">Anthropic API key</h2>
          {savedKey ? (
            <span className="rounded-lg bg-accent px-3 py-1 text-sm font-black text-accent-ink uppercase">Key saved · {maskKey(savedKey)}</span>
          ) : (
            <span className="rounded-lg border-2 border-warn px-3 py-1 text-sm font-black text-warn uppercase">No key saved</span>
          )}
        </div>
        <p className="mt-2 text-muted">
          With a key saved, Import sends the file&apos;s text to this demo&apos;s server, which asks Claude to read it and sends the
          logins back. The server doesn&apos;t log or keep the key or the file. Without a key, Import uses the simulated reader.
        </p>
        <p className="mt-2 text-sm text-warn">
          The key is kept in this browser&apos;s localStorage, so anyone using this browser could find it. Use a key you can
          revoke after the demo.
        </p>

        <label className="label mt-6" htmlFor="key">{savedKey ? "Replace the key" : "Paste a key"}</label>
        <input
          id="key"
          className="field font-mono"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-accent" onClick={save} disabled={!draft.trim()}>Save</button>
          <button className="btn-ghost" onClick={runTest} disabled={test.kind === "testing" || (!draft.trim() && !savedKey)}>
            {test.kind === "testing" ? "Testing…" : "Test Key"}
          </button>
          <button className="btn-danger" onClick={clear} disabled={!savedKey && !draft}>Clear Key</button>
        </div>
        {test.kind === "ok" && <p className="mt-4 rounded-xl bg-accent px-4 py-3 font-bold text-accent-ink">✓ {test.text}</p>}
        {test.kind === "error" && <p role="alert" className="mt-4 rounded-xl bg-danger px-4 py-3 font-bold text-white">✕ {test.text}</p>}

        <fieldset className="mt-8">
          <legend className="label">Model used for reading</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {MODELS.map((m) => (
              <label
                key={m.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 ${model === m.id ? "border-accent bg-panel-2" : "border-line"}`}
              >
                <input
                  type="radio"
                  name="model"
                  className="h-5 w-5 accent-[#b8ff24]"
                  checked={model === m.id}
                  onChange={() => {
                    setModelState(m.id);
                    setModel(m.id);
                  }}
                />
                <span>
                  <span className="block font-black">
                    {m.label}
                    {m.id === "claude-sonnet-5-5" && <span className="ml-2 text-xs text-muted uppercase">default</span>}
                  </span>
                  <span className="font-mono text-xs text-muted">{m.id}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card mt-6 border-danger">
        <h2 className="text-2xl font-black">Reset Demo</h2>
        <p className="mt-2 text-muted">
          Wipes the encrypted vault from this browser and starts over at first run. The API key and model choice stay.
        </p>
        {confirmReset ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn-danger"
              onClick={() => {
                resetDemo();
                router.push("/setup");
              }}
            >
              Yes, wipe the vault
            </button>
            <button className="btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        ) : (
          <button className="btn-danger mt-4" onClick={() => setConfirmReset(true)}>Reset Demo</button>
        )}
      </section>
    </Page>
  );
}
