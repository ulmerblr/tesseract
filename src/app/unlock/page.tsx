"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useVault } from "@/components/VaultProvider";
import { Page } from "@/components/RequireUnlocked";
import { LockIcon } from "@/components/TopBar";
import { WrongPasswordError } from "@/lib/crypto";

function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next") ?? "/vault";
  // Only allow same-site paths.
  return next.startsWith("/") && !next.startsWith("//") ? next : "/vault";
}

export default function UnlockPage() {
  const { status, unlock } = useVault();
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "none") router.replace("/setup");
    if (status === "unlocked") router.replace(nextPath());
  }, [status, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await unlock(pw);
    } catch (err) {
      setError(err instanceof WrongPasswordError ? "Wrong master password. Try again." : "Couldn't open the vault.");
      setPw("");
      setBusy(false);
    }
  }

  return (
    <Page>
      <div className="flex flex-col items-center text-center">
        <div className="rounded-3xl bg-accent p-5 text-accent-ink">
          <LockIcon className="h-12 w-12" />
        </div>
        <h1 className="display-title mt-6">Vault locked</h1>
        <p className="mt-3 text-lg text-muted">Enter your master password to open it.</p>
      </div>
      <form onSubmit={submit} className="card mx-auto mt-8 grid max-w-md gap-4">
        <label className="label" htmlFor="pw">Master password</label>
        <input
          id="pw"
          className={`field text-lg ${error ? "border-danger" : ""}`}
          type="password"
          autoComplete="current-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
        />
        {error && (
          <p role="alert" className="rounded-xl bg-danger px-4 py-3 text-center font-black text-white">
            {error}
          </p>
        )}
        <button className="btn-accent text-lg" disabled={busy || !pw}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </Page>
  );
}
