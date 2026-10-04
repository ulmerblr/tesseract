"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createVault, deleteVault, openWithPassword, saveVault, vaultExists, type VaultSession } from "@/lib/crypto";
import * as bio from "@/lib/biometric";
import { newId, type Login, type LoginFields, type VaultData } from "@/lib/types";
import { useHydrated } from "@/lib/useHydrated";

export const AUTO_LOCK_SECONDS = 120;
export const CLIPBOARD_SECONDS = 30;

type Status = "loading" | "none" | "locked" | "unlocked";
type ClipState = { label: string; secondsLeft: number; message?: string } | null;
export type LockReason = "manual" | "idle" | null;

type VaultContextValue = {
  status: Status;
  logins: Login[];
  lockInSeconds: number;
  autoLockPaused: boolean;
  lockReason: LockReason;
  biometricOn: boolean;
  clip: ClipState;
  create(password: string): Promise<void>;
  unlock(password: string): Promise<void>;
  unlockWithBiometric(signal?: AbortSignal): Promise<void>;
  enableBiometric(): Promise<void>;
  disableBiometric(): void;
  setAutoLockPaused(paused: boolean): void;
  lock(): void;
  dismissedDuplicates: string[];
  addLogins(items: LoginFields[]): Promise<Login[]>;
  /** Replaces the whole login list in one save (imports with merges, duplicate merges). */
  replaceLogins(next: Login[]): Promise<void>;
  dismissDuplicates(key: string): Promise<void>;
  /** Re-checks identity without changing the session: true only if the vault really opened. */
  verifyPassword(password: string): Promise<boolean>;
  verifyBiometric(signal?: AbortSignal): Promise<void>;
  updateLogin(id: string, fields: LoginFields): Promise<void>;
  deleteLogin(id: string): Promise<void>;
  resetDemo(): void;
  copy(text: string, label: string): Promise<void>;
  clearClipboardNow(): void;
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used inside VaultProvider");
  return ctx;
}

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  // Once something happens (unlock, lock, reset) the status is tracked here;
  // before that it comes straight from whether a vault is in storage.
  const [tracked, setStatus] = useState<Status | null>(null);
  const status: Status = tracked ?? (!hydrated ? "loading" : vaultExists() ? "locked" : "none");
  const [logins, setLogins] = useState<Login[]>([]);
  // The vault key lives only in memory, and only while unlocked.
  const keyRef = useRef<VaultSession | null>(null);
  const [lockReason, setLockReason] = useState<LockReason>(null);
  const [autoLockPaused, setAutoLockPaused] = useState(false);
  // Bumped whenever face/fingerprint is turned on or off, so it re-reads storage.
  const [bioVersion, setBioVersion] = useState(0);
  const biometricOn = hydrated && bioVersion >= 0 && bio.biometricEnabled();
  const loginsRef = useRef<Login[]>([]);
  const dismissedRef = useRef<string[]>([]);
  const [dismissedDuplicates, setDismissed] = useState<string[]>([]);
  const lastActivity = useRef(0);
  const [lockInSeconds, setLockInSeconds] = useState(AUTO_LOCK_SECONDS);
  const [clip, setClip] = useState<ClipState>(null);

  const lock = useCallback((reason: LockReason = "manual") => {
    setLockReason(reason);
    keyRef.current = null;
    loginsRef.current = [];
    dismissedRef.current = [];
    setLogins([]);
    setDismissed([]);
    setStatus(vaultExists() ? "locked" : "none");
  }, []);

  const persist = useCallback(async (next: Login[], dismissed: string[] = dismissedRef.current) => {
    const handle = keyRef.current;
    if (!handle) throw new Error("The vault is locked.");
    loginsRef.current = next;
    dismissedRef.current = dismissed;
    setLogins(next);
    setDismissed(dismissed);
    await saveVault(handle, { logins: next, dismissedDuplicates: dismissed });
  }, []);

  const opened = useCallback(({ session, data }: { session: VaultSession; data: VaultData }) => {
    keyRef.current = session;
    loginsRef.current = data.logins;
    dismissedRef.current = data.dismissedDuplicates ?? [];
    setLogins(data.logins);
    setDismissed(dismissedRef.current);
    lastActivity.current = Date.now();
    setLockReason(null);
    setStatus("unlocked");
  }, []);

  const create = useCallback(async (password: string) => opened(await createVault(password)), [opened]);
  const unlock = useCallback(async (password: string) => opened(await openWithPassword(password)), [opened]);
  const unlockWithBiometric = useCallback(
    async (signal?: AbortSignal) => opened(await bio.unlockWithBiometric(signal)),
    [opened],
  );

  const enableBiometric = useCallback(async () => {
    if (!keyRef.current) throw new Error("Unlock the vault first.");
    await bio.enableBiometric(keyRef.current);
    setBioVersion((v) => v + 1);
  }, []);

  const disableBiometric = useCallback(() => {
    bio.disableBiometric();
    setBioVersion((v) => v + 1);
  }, []);

  const addLogins = useCallback(
    async (items: LoginFields[]) => {
      const now = Date.now();
      const added = items.map((f) => ({ ...f, id: newId(), createdAt: now, updatedAt: now }));
      await persist([...loginsRef.current, ...added]);
      return added;
    },
    [persist],
  );

  const replaceLogins = useCallback(async (next: Login[]) => persist(next), [persist]);

  const dismissDuplicates = useCallback(
    async (key: string) => persist(loginsRef.current, [...new Set([...dismissedRef.current, key])]),
    [persist],
  );

  const verifyPassword = useCallback(async (password: string) => {
    try {
      await openWithPassword(password);
      return true;
    } catch {
      return false;
    }
  }, []);

  const verifyBiometric = useCallback(async (signal?: AbortSignal) => {
    // Genuinely decrypts the vault again through the passkey's PRF; the result is discarded.
    await bio.unlockWithBiometric(signal);
  }, []);

  const updateLogin = useCallback(
    async (id: string, fields: LoginFields) => {
      await persist(loginsRef.current.map((l) => (l.id === id ? { ...l, ...fields, updatedAt: Date.now() } : l)));
    },
    [persist],
  );

  const deleteLogin = useCallback(
    async (id: string) => {
      await persist(loginsRef.current.filter((l) => l.id !== id));
    },
    [persist],
  );

  const resetDemo = useCallback(() => {
    bio.disableBiometric();
    deleteVault();
    setBioVersion((v) => v + 1);
    setLockReason(null);
    keyRef.current = null;
    loginsRef.current = [];
    setLogins([]);
    setStatus("none");
  }, []);

  // ----- Auto-lock after 2 minutes idle -----
  useEffect(() => {
    if (status !== "unlocked") return;
    const bump = () => {
      lastActivity.current = Date.now();
    };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = window.setInterval(() => {
      // Paused (e.g. an import preview still has rows): treat as active.
      if (autoLockPaused) lastActivity.current = Date.now();
      const left = AUTO_LOCK_SECONDS - Math.floor((Date.now() - lastActivity.current) / 1000);
      if (left <= 0) lock("idle");
      else setLockInSeconds(left);
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(timer);
    };
  }, [status, lock, autoLockPaused]);

  // ----- Clipboard that clears itself -----
  const clipTimer = useRef<number | null>(null);

  const wipeClipboard = useCallback(async () => {
    if (clipTimer.current) window.clearInterval(clipTimer.current);
    clipTimer.current = null;
    try {
      await navigator.clipboard.writeText("");
      setClip({ label: "", secondsLeft: 0, message: "Clipboard cleared." });
    } catch {
      setClip({ label: "", secondsLeft: 0, message: "Couldn't clear the clipboard automatically (Tesseract wasn't the active window). Copy something else to overwrite it." });
    }
    window.setTimeout(() => setClip((c) => (c && c.secondsLeft === 0 ? null : c)), 4000);
  }, []);

  const copy = useCallback(
    async (text: string, label: string) => {
      await navigator.clipboard.writeText(text);
      if (clipTimer.current) window.clearInterval(clipTimer.current);
      const endsAt = Date.now() + CLIPBOARD_SECONDS * 1000;
      setClip({ label, secondsLeft: CLIPBOARD_SECONDS });
      clipTimer.current = window.setInterval(() => {
        const left = Math.ceil((endsAt - Date.now()) / 1000);
        if (left <= 0) void wipeClipboard();
        else setClip({ label, secondsLeft: left });
      }, 250);
    },
    [wipeClipboard],
  );

  useEffect(() => () => {
    if (clipTimer.current) window.clearInterval(clipTimer.current);
  }, []);

  return (
    <VaultContext.Provider
      value={{
        status,
        logins,
        lockInSeconds,
        autoLockPaused,
        lockReason,
        biometricOn,
        clip,
        create,
        unlock,
        unlockWithBiometric,
        enableBiometric,
        disableBiometric,
        setAutoLockPaused,
        lock: () => lock("manual"),
        dismissedDuplicates,
        addLogins,
        replaceLogins,
        dismissDuplicates,
        verifyPassword,
        verifyBiometric,
        updateLogin,
        deleteLogin,
        resetDemo,
        copy,
        clearClipboardNow: () => void wipeClipboard(),
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}
