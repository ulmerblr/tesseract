"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useVault } from "@/components/VaultProvider";
import { Page } from "@/components/RequireUnlocked";
import { LockIcon } from "@/components/TopBar";
import { UnlockPanel } from "@/components/UnlockPanel";
import { LocalPromise } from "@/components/LocalPromise";

function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next") ?? "/vault";
  // Only allow same-site paths.
  return next.startsWith("/") && !next.startsWith("//") ? next : "/vault";
}

export default function UnlockPage() {
  const { status, lockReason, biometricOn } = useVault();
  const router = useRouter();

  useEffect(() => {
    if (status === "none") router.replace("/setup");
    if (status === "unlocked") router.replace(nextPath());
  }, [status, router]);

  return (
    <Page>
      <div className="flex flex-col items-center text-center">
        <div className="rounded-3xl bg-accent p-5 text-accent-ink">
          <LockIcon className="h-12 w-12" />
        </div>
        <h1 className="display-title mt-6">Vault locked</h1>
        <p className="mt-3 text-lg text-muted">
          {lockReason === "idle"
            ? "Locked after 2 minutes without activity."
            : biometricOn
              ? "Use your face or fingerprint, or your master password."
              : "Enter your master password to open it."}
        </p>
      </div>
      <div className="card mx-auto mt-8 max-w-md">
        {status === "locked" && (
          // Ask automatically only when Tesseract was just opened or reloaded. After Lock or an idle
          // lock, the person clicks first (no system prompt popping up at someone who walked away).
          <UnlockPanel key={String(biometricOn)} variant="page" autoPrompt={lockReason === null} />
        )}
      </div>
      <LocalPromise className="mt-8" />
    </Page>
  );
}
