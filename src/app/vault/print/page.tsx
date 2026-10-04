"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useVault } from "@/components/VaultProvider";
import { Page, RequireUnlocked } from "@/components/RequireUnlocked";
import { FingerprintIcon } from "@/components/UnlockPanel";
import { EmergencySheet, type SheetData } from "@/components/EmergencySheet";
import { describeBiometricError } from "@/lib/biometric";

// Print-only flow. Nothing here is written to storage: the sheet exists only
// in memory while the print window is open, then it and any typed master
// password are dropped and the vault is shown again.

export default function PrintPage() {
  return (
    <RequireUnlocked>
      <PrintFlow />
    </RequireUnlocked>
  );
}

const NOT_SAVED = "Your Tesseract master password is NOT saved. Tesseract forgets it the moment this sheet is printed.";
const PAPER_ONLY = "Choose a paper printer. Saving this as a PDF creates an unprotected file of every password on it.";

type Step = "verify" | "select" | "final";

function PrintFlow() {
  const { logins } = useVault();
  const router = useRouter();
  const [step, setStep] = useState<Step>("verify");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [includeMaster, setIncludeMaster] = useState(false);
  const [masterPw, setMasterPw] = useState("");
  const [masterOk, setMasterOk] = useState(false);
  const [sheet, setSheet] = useState<SheetData | null>(null);

  const sorted = useMemo(
    () => [...logins].sort((a, b) => (a.site || a.url).localeCompare(b.site || b.url, undefined, { sensitivity: "base" })),
    [logins],
  );

  /** Forget everything from this flow and go back to the vault. */
  const finish = () => {
    setSheet(null);
    setMasterPw("");
    setMasterOk(false);
    setIncludeMaster(false);
    setSelected(new Set());
    router.replace("/vault");
  };

  if (step === "verify") return <Verify onVerified={() => setStep("select")} onCancel={() => finish()} />;

  if (step === "select") {
    return (
      <SelectStep
        logins={sorted}
        selected={selected}
        setSelected={setSelected}
        query={query}
        setQuery={setQuery}
        includeMaster={includeMaster}
        setIncludeMaster={(on) => {
          setIncludeMaster(on);
          if (!on) {
            setMasterPw("");
            setMasterOk(false);
          }
        }}
        masterPw={masterPw}
        setMasterPw={(v) => {
          setMasterPw(v);
          setMasterOk(false);
        }}
        masterOk={masterOk}
        setMasterOk={setMasterOk}
        onNext={() => setStep("final")}
        onCancel={() => finish()}
      />
    );
  }

  const chosen = sorted.filter((l) => selected.has(l.id));
  return (
    <Page>
      <h1 className="display-title">Ready to print</h1>
      <p className="mt-3 text-lg">
        <b>{chosen.length}</b> login{chosen.length === 1 ? "" : "s"}, A to Z{includeMaster ? ", plus your master password at the top" : ""}.
      </p>
      <div className="mt-6 grid gap-3">
        <p className="rounded-xl border-4 border-warn bg-warn/10 p-4 text-lg font-black">{PAPER_ONLY}</p>
        {includeMaster && <p className="rounded-xl border-4 border-danger bg-danger/10 p-4 text-lg font-black">{NOT_SAVED}</p>}
        <p className="text-muted">
          The sheet is made when you click Print and is wiped as soon as the print window closes. Nothing is saved on this laptop.
        </p>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          className="btn-accent px-8 py-4 text-xl"
          onClick={() => setSheet({ logins: chosen, masterPassword: includeMaster && masterOk ? masterPw : "", printedAt: new Date() })}
        >
          Print
        </button>
        <button className="btn-ghost" onClick={() => setStep("select")}>Back</button>
        <button className="btn-ghost" onClick={() => finish()}>Cancel</button>
      </div>
      {sheet && <PrintJob data={sheet} onClosed={() => finish()} />}
    </Page>
  );
}

/** Puts the sheet in the page for the print window only, prints, then reports when the window has closed. */
function PrintJob({ data, onClosed }: { data: SheetData; onClosed(): void }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const closed = useRef(onClosed);
  useEffect(() => {
    closed.current = onClosed;
  });

  useEffect(() => {
    const el = document.createElement("div");
    el.className = "print-root";
    document.body.appendChild(el);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHost(el);
    return () => {
      el.remove();
    };
  }, []);

  useEffect(() => {
    if (!host) return;
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      window.removeEventListener("afterprint", end);
      // Unmounting the sheet removes it from the page; the host element goes with it.
      closed.current();
    };
    window.addEventListener("afterprint", end);
    void (async () => {
      // Make sure the bundled monospace font is ready before the print window renders.
      // Only the bundled face itself; its fallback entry points at a system font that may not exist.
      const family = getComputedStyle(document.documentElement).getPropertyValue("--font-print-mono").split(",")[0].trim();
      try {
        if (family) await Promise.all([document.fonts.load(`400 12pt ${family}`), document.fonts.load(`700 12pt ${family}`)]);
        await document.fonts.ready;
      } catch {
        /* print with the fallback font */
      }
      window.print();
    })();
    return () => window.removeEventListener("afterprint", end);
  }, [host]);

  return host ? createPortal(<EmergencySheet data={data} />, host) : null;
}

function Verify({ onVerified, onCancel }: { onVerified(): void; onCancel(): void }) {
  const { biometricOn, verifyBiometric, verifyPassword } = useVault();
  const [usePassword, setUsePassword] = useState(!biometricOn);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Page>
      <div className="font-mono text-sm font-bold text-accent">EMERGENCY SHEET</div>
      <h1 className="display-title mt-2">Confirm it&apos;s you</h1>
      <p className="mt-3 text-lg text-muted">A printed sheet shows passwords in plain text, so Tesseract checks again before making one.</p>
      <div className="card mt-8 grid max-w-md gap-4">
        {!usePassword ? (
          <>
            <button
              className="btn-accent py-4 text-lg"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await verifyBiometric();
                  onVerified();
                } catch (err) {
                  setError(`${describeBiometricError(err)} Use your master password instead.`);
                  setUsePassword(true);
                  setBusy(false);
                }
              }}
            >
              <FingerprintIcon className="h-6 w-6" /> {busy ? "Check your face or fingerprint…" : "Confirm with face or fingerprint"}
            </button>
            <button className="text-sm font-bold text-muted underline" onClick={() => setUsePassword(true)}>
              Use master password instead
            </button>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const ok = await verifyPassword(pw);
              setPw("");
              setBusy(false);
              if (ok) onVerified();
              else setError("Wrong master password. No sheet without a correct check.");
            }}
          >
            <label className="label" htmlFor="verify-pw">Master password</label>
            <input id="verify-pw" className="field text-lg" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
            <button className="btn-accent text-lg" disabled={busy || !pw}>{busy ? "Checking…" : "Confirm"}</button>
          </form>
        )}
        {error && <p role="alert" className="rounded-xl bg-danger px-4 py-3 font-bold text-white">{error}</p>}
      </div>
      <button className="btn-ghost mt-6" onClick={onCancel}>Cancel</button>
    </Page>
  );
}

type SelectProps = {
  logins: ReturnType<typeof useVault>["logins"];
  selected: Set<string>;
  setSelected(s: Set<string>): void;
  query: string;
  setQuery(q: string): void;
  includeMaster: boolean;
  setIncludeMaster(on: boolean): void;
  masterPw: string;
  setMasterPw(v: string): void;
  masterOk: boolean;
  setMasterOk(ok: boolean): void;
  onNext(): void;
  onCancel(): void;
};

function SelectStep(p: SelectProps) {
  const { verifyPassword } = useVault();
  const [checking, setChecking] = useState(false);
  const [masterError, setMasterError] = useState("");
  const q = p.query.trim().toLowerCase();
  const visible = q ? p.logins.filter((l) => [l.site, l.url, l.username].some((s) => s.toLowerCase().includes(q))) : p.logins;
  const masterReady = !p.includeMaster || p.masterOk;

  const toggle = (id: string) => {
    const next = new Set(p.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    p.setSelected(next);
  };

  async function checkMaster() {
    setChecking(true);
    setMasterError("");
    const ok = await verifyPassword(p.masterPw);
    setChecking(false);
    p.setMasterOk(ok);
    if (!ok) setMasterError("That isn't the master password for this vault.");
  }

  return (
    <Page wide>
      <div className="font-mono text-sm font-bold text-accent">EMERGENCY SHEET</div>
      <h1 className="display-title mt-2">What goes on the sheet?</h1>

      <section className="card mt-8">
        <label className="flex items-start gap-3 text-lg font-bold">
          <input type="checkbox" className="mt-1.5 h-5 w-5 accent-[#18c2ff]" checked={p.includeMaster} onChange={(e) => p.setIncludeMaster(e.target.checked)} />
          <span>
            Include master password on this sheet
            <span className="mt-1 block text-base font-bold text-warn">Anyone holding this paper can open your whole vault.</span>
          </span>
        </label>
        {p.includeMaster && (
          <div className="mt-4 grid max-w-md gap-3">
            <p className="font-black">{NOT_SAVED}</p>
            <label className="label" htmlFor="master-pw">Type your master password</label>
            <div className="flex gap-2">
              <input
                id="master-pw"
                className="field"
                type="password"
                autoComplete="off"
                value={p.masterPw}
                onChange={(e) => p.setMasterPw(e.target.value)}
              />
              <button className="btn-ghost btn-sm shrink-0" disabled={!p.masterPw || checking} onClick={() => void checkMaster()}>
                {checking ? "Checking…" : "Verify"}
              </button>
            </div>
            {p.masterOk && <p className="font-bold text-accent">✓ Verified against the vault.</p>}
            {masterError && <p role="alert" className="font-bold text-danger">{masterError}</p>}
          </div>
        )}
      </section>

      <section className="card mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn-accent"
            disabled={!masterReady || p.logins.length === 0}
            onClick={() => {
              p.setSelected(new Set(p.logins.map((l) => l.id)));
              p.onNext();
            }}
          >
            Print all ({p.logins.length})
          </button>
          <span className="text-muted">or pick some:</span>
          <button className="btn-ghost btn-sm" onClick={() => p.setSelected(new Set([...p.selected, ...visible.map((l) => l.id)]))}>Select all</button>
          <button
            className="btn-ghost btn-sm"
            onClick={() => {
              const hide = new Set(visible.map((l) => l.id));
              p.setSelected(new Set([...p.selected].filter((id) => !hide.has(id))));
            }}
          >
            Select none
          </button>
        </div>
        <input
          type="search"
          className="field mt-4"
          placeholder="Search logins…"
          aria-label="Search logins to print"
          value={p.query}
          onChange={(e) => p.setQuery(e.target.value)}
        />
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {visible.map((l) => (
            <li key={l.id}>
              <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 ${p.selected.has(l.id) ? "border-accent bg-panel-2" : "border-line"}`}>
                <input type="checkbox" className="h-5 w-5 accent-[#18c2ff]" checked={p.selected.has(l.id)} onChange={() => toggle(l.id)} />
                <span className="min-w-0">
                  <span className="block truncate font-black">{l.site || l.url || "Untitled"}</span>
                  <span className="block truncate text-sm text-muted">{l.username}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button className="btn-accent text-lg" disabled={p.selected.size === 0 || !masterReady} onClick={p.onNext}>
          Continue with {p.selected.size} selected
        </button>
        <button className="btn-ghost" onClick={p.onCancel}>Cancel</button>
        {!masterReady && <span className="font-bold text-warn">Verify the master password first, or untick that box.</span>}
      </div>
    </Page>
  );
}
