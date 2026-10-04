"use client";

import { useEffect, useRef, useState } from "react";
import { useVault } from "./VaultProvider";
import { WrongPasswordError } from "@/lib/crypto";
import { describeBiometricError } from "@/lib/biometric";

type Props = {
  /** "page" for the full unlock screen; "inline" inside the pretend site (no <form>, since that sits in the site's form). */
  variant: "page" | "inline";
  /** Ask for face or fingerprint as soon as this appears. */
  autoPrompt: boolean;
};

type Mode =
  | { kind: "checking" } // waiting on the operating system's face/fingerprint prompt
  | { kind: "button"; note?: string } // the browser needs a click first
  | { kind: "password"; note?: string };

// A rejection this fast, before any user interaction, means the browser wants a click first.
const NEEDS_CLICK_MS = 1200;

export function UnlockPanel({ variant, autoPrompt }: Props) {
  const { biometricOn, unlock, unlockWithBiometric } = useVault();
  const [mode, setMode] = useState<Mode>(() =>
    biometricOn ? (autoPrompt ? { kind: "checking" } : { kind: "button" }) : { kind: "password" },
  );
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inline = variant === "inline";

  async function tryBiometric(fromClick: boolean) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError("");
    setMode({ kind: "checking" });
    const started = Date.now();
    try {
      await unlockWithBiometric(ctrl.signal);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const fast = Date.now() - started < NEEDS_CLICK_MS;
      const interacted = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
      const notAllowed = err instanceof DOMException && err.name === "NotAllowedError";
      if (!fromClick && notAllowed && fast && !interacted) setMode({ kind: "button" });
      else setMode({ kind: "password", note: `${describeBiometricError(err)} Use your master password instead.` });
    }
  }

  useEffect(() => {
    // Runs once: an automatic prompt as soon as the unlock view appears.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (biometricOn && autoPrompt) void tryBiometric(false);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitPassword() {
    if (!pw || busy) return;
    setBusy(true);
    setError("");
    try {
      await unlock(pw);
    } catch (err) {
      setError(err instanceof WrongPasswordError ? "Wrong master password. Try again." : "Couldn't open the vault.");
      setPw("");
      setBusy(false);
    }
  }

  const bioButtonCls = inline ? "btn-accent btn-sm w-full" : "btn-accent w-full py-4 text-lg";

  if (mode.kind === "checking") {
    return (
      <div className={inline ? "grid gap-3 p-4" : "grid justify-items-center gap-4 py-4 text-center"}>
        <FingerprintIcon className={inline ? "h-8 w-8 text-accent" : "h-16 w-16 animate-pulse text-accent"} />
        <p className="font-bold">Check your face or fingerprint…</p>
        <button
          type="button"
          className="text-sm font-bold text-muted underline hover:text-fg"
          onClick={() => {
            abortRef.current?.abort();
            setMode({ kind: "password" });
          }}
        >
          Use master password instead
        </button>
      </div>
    );
  }

  if (mode.kind === "button") {
    return (
      <div className={inline ? "grid gap-3 p-4" : "grid gap-4"}>
        {inline && <p className="text-sm font-bold">Tesseract is locked.</p>}
        <button type="button" className={bioButtonCls} onClick={() => void tryBiometric(true)}>
          <FingerprintIcon className={inline ? "h-4 w-4" : "h-6 w-6"} /> Unlock with face or fingerprint
        </button>
        {mode.note && <p className="text-sm text-muted">{mode.note}</p>}
        <button type="button" className="text-sm font-bold text-muted underline hover:text-fg" onClick={() => setMode({ kind: "password" })}>
          Use master password instead
        </button>
      </div>
    );
  }

  const fields = (
    <>
      {inline && <p className="text-sm font-bold">Tesseract is locked. Unlock to continue.</p>}
      {mode.note && (
        <p className={`rounded-xl bg-panel-2 px-3 py-2 text-sm font-bold ${inline ? "" : "text-center"}`}>{mode.note}</p>
      )}
      {!inline && <label className="label" htmlFor="unlock-pw">Master password</label>}
      <input
        id={inline ? undefined : "unlock-pw"}
        type="password"
        aria-label="Master password"
        placeholder={inline ? "Master password" : undefined}
        className={`field ${inline ? "py-2 text-sm" : "text-lg"} ${error ? "border-danger" : ""}`}
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => {
          if (inline && e.key === "Enter") {
            e.preventDefault();
            void submitPassword();
          }
        }}
        autoComplete="current-password"
        autoFocus={!inline}
      />
      {error && (
        <p role="alert" className={inline ? "text-sm font-bold text-danger" : "rounded-xl bg-danger px-4 py-3 text-center font-black text-white"}>
          {error}
        </p>
      )}
      <button
        type={inline ? "button" : "submit"}
        className={inline ? "btn-accent btn-sm" : "btn-accent text-lg"}
        disabled={busy || !pw}
        onClick={inline ? () => void submitPassword() : undefined}
      >
        {busy ? "Unlocking…" : "Unlock"}
      </button>
      {biometricOn && (
        <button type="button" className="text-sm font-bold text-accent hover:underline" onClick={() => void tryBiometric(true)}>
          Try face or fingerprint again
        </button>
      )}
    </>
  );

  return inline ? (
    <div className="grid gap-2 p-4">{fields}</div>
  ) : (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submitPassword();
      }}
    >
      {fields}
    </form>
  );
}

export function FingerprintIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className} aria-hidden>
      <path d="M12 11v3a8 8 0 0 1-1.5 4.7" />
      <path d="M8.5 9.5A3.5 3.5 0 0 1 15.5 11v1.5a12 12 0 0 1-.8 4.3" />
      <path d="M5.5 15.5A12 12 0 0 0 6 12a6 6 0 0 1 10.5-4" />
      <path d="M18.6 9.5c.3.8.4 1.6.4 2.5a17 17 0 0 1-.6 4.5" />
      <path d="M3.5 9.5A9 9 0 0 1 17 4.6" />
      <path d="M8.6 20.3A12 12 0 0 0 9 17" />
    </svg>
  );
}
