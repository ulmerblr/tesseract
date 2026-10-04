"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useVault } from "@/components/VaultProvider";
import { Page } from "@/components/RequireUnlocked";

const MIN_LENGTH = 8;

export default function SetupPage() {
  const { status, create } = useVault();
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "locked") router.replace("/unlock");
  }, [status, router]);

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
      router.push("/import");
    } catch {
      setError("Couldn't create the vault in this browser.");
      setBusy(false);
    }
  }

  return (
    <Page>
      <div className="font-mono text-sm font-bold text-accent">FIRST RUN</div>
      <h1 className="display-title mt-2">Create your master password</h1>
      <p className="mt-4 text-lg text-muted">This one password encrypts your whole vault. Tesseract never stores it and never sends it anywhere.</p>

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
