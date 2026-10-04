"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useVault } from "@/components/VaultProvider";
import { Page } from "@/components/RequireUnlocked";
import { LocalPromise } from "@/components/LocalPromise";
import { FingerprintIcon } from "@/components/UnlockPanel";
import { legacyVaultExists } from "@/lib/crypto";
import { checkBiometricSupport, describeBiometricError, type BiometricSupport } from "@/lib/biometric";
import { useHydrated } from "@/lib/useHydrated";

const MIN_LENGTH = 8;

type Step = { kind: "form" } | { kind: "biometric"; support: BiometricSupport; error?: string; busy?: boolean };

export default function SetupPage() {
  const { status, create, enableBiometric } = useVault();
  const router = useRouter();
  const hydrated = useHydrated();
  const [legacy] = useState(() => typeof window !== "undefined" && legacyVaultExists());
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "form" });

  useEffect(() => {
    if (status === "locked") router.replace("/unlock");
  }, [status, router]);

  if (step.kind === "biometric") {
    const { support } = step;
    return (
      <Page>
        <div className="font-mono text-sm font-bold text-accent">VAULT CREATED</div>
        <h1 className="display-title mt-2">Unlock with your face or fingerprint?</h1>
        {support.available ? (
          <>
            <p className="mt-4 text-lg text-muted">
              Windows Hello or Touch ID can open the vault instead of typing your master password. Your face and fingerprint
              stay inside the operating system; Tesseract never sees them. The master password keeps working too.
            </p>
            <button
              className="btn-accent mt-8 w-full py-5 text-xl sm:w-auto sm:px-10"
              disabled={step.busy}
              onClick={async () => {
                setStep({ ...step, busy: true, error: undefined });
                try {
                  await enableBiometric();
                  router.push("/import");
                } catch (err) {
                  // If this showed the device can't do PRF, hide the button and just say why.
                  const now = await checkBiometricSupport();
                  setStep(now.available ? { ...step, busy: false, error: describeBiometricError(err) } : { kind: "biometric", support: now });
                }
              }}
            >
              <FingerprintIcon className="h-6 w-6" /> {step.busy ? "Waiting for your device…" : "Turn on face/fingerprint unlock"}
            </button>
            {step.error && <p role="alert" className="mt-4 rounded-xl bg-danger px-4 py-3 font-bold text-white">{step.error}</p>}
          </>
        ) : (
          <p className="mt-4 text-lg">{support.reason}</p>
        )}
        <div className="mt-6">
          <Link href="/import" className="font-bold text-muted underline hover:text-fg">
            {support.available ? "Skip for now" : "Continue"} →
          </Link>
        </div>
      </Page>
    );
  }

  if (status === "unlocked" && !busy) {
    return (
      <Page>
        <h1 className="display-title">Your vault is already set up.</h1>
        <p className="mt-4 text-muted">To start over, use Reset Demo on the Admin page.</p>
        <div className="mt-6 flex gap-3">
          <Link href="/vault" className="btn-accent">Open the vault</Link>
          <Link href="/admin" className="btn-ghost">Admin</Link>
        </div>
      </Page>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (pw.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (pw !== pw2) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      await create(pw);
    } catch {
      setError("Couldn't create the vault on this laptop.");
      setBusy(false);
      return;
    }
    const support = await checkBiometricSupport();
    // No face or fingerprint hardware: skip the step entirely.
    if (!support.available && support.noBiometrics) router.push("/import");
    else setStep({ kind: "biometric", support });
  }

  return (
    <Page>
      {hydrated && legacy && (
        <div className="mb-6 rounded-2xl border-2 border-accent bg-accent/10 p-4 font-bold">
          Tesseract has been updated. Your earlier demo vault used an older format and was cleared. Please create a new
          master password.
        </div>
      )}
      <div className="font-mono text-sm font-bold text-accent">FIRST RUN</div>
      <h1 className="display-title mt-2">Create your master password</h1>
      <p className="mt-4 text-lg text-muted">This one password encrypts your whole vault. Tesseract never stores it and never sends it anywhere.</p>
      <LocalPromise className="mt-4 justify-start" />

      <div className="mt-6 rounded-2xl border-2 border-warn bg-warn/10 p-5">
        <div className="text-lg font-black text-warn uppercase">Forget it and the vault is gone forever.</div>
        <p className="mt-1">There is no reset link and no recovery. Nobody, including us, can open the vault without it.</p>
      </div>

      <form onSubmit={submit} className="card mt-6 grid gap-5">
        <div>
          <label className="label" htmlFor="pw">Master password</label>
          <input id="pw" className="field text-lg" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="pw2">Enter it again</label>
          <input id="pw2" className="field text-lg" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        {error && <p role="alert" className="font-bold text-danger">{error}</p>}
        <button className="btn-accent text-lg" disabled={busy || !pw || !pw2}>
          {busy ? "Creating vault…" : "Create my vault"}
        </button>
        <p className="text-sm text-muted">Demo tip: make up a password you won&apos;t use anywhere else.</p>
      </form>
    </Page>
  );
}
