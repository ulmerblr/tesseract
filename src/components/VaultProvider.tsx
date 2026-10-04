"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createVault, deleteVault, openVault, saveVault, vaultExists, type VaultKey } from "@/lib/crypto";
import { newId, type Login, type LoginFields } from "@/lib/types";
import { useHydrated } from "@/lib/useHydrated";

export const AUTO_LOCK_SECONDS = 120;
export const CLIPBOARD_SECONDS = 30;

type Status = "loading" | "none" | "locked" | "unlocked";
type ClipState = { label: string; secondsLeft: number; message?: string } | null;

type VaultContextValue = {
  status: Status;
  logins: Login[];
  lockInSeconds: number;
  clip: ClipState;
  create(password: string): Promise<void>;
  unlock(password: string): Promise<void>;
  lock(): void;
  addLogins(items: LoginFields[]): Promise<Login[]>;
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
  // The derived key lives only in memory, and only while unlocked.
  const keyRef = useRef<VaultKey | null>(null);
  const loginsRef = useRef<Login[]>([]);
  const lastActivity = useRef(0);
  const [lockInSeconds, setLockInSeconds] = useState(AUTO_LOCK_SECONDS);
  const [clip, setClip] = useState<ClipState>(null);

  const lock = useCallback(() => {
    keyRef.current = null;
    loginsRef.current = [];
    setLogins([]);
    setStatus(vaultExists() ? "locked" : "none");
  }, []);

  const persist = useCallback(async (next: Login[]) => {
    const handle = keyRef.current;
    if (!handle) throw new Error("The vault is locked.");
    loginsRef.current = next;
    setLogins(next);
    await saveVault(handle, { logins: next });
  }, []);

  const create = useCallback(async (password: string) => {
    const { handle, data } = await createVault(password);
    keyRef.current = handle;
    loginsRef.current = data.logins;
    setLogins(data.logins);
    lastActivity.current = Date.now();
    setStatus("unlocked");
  }, []);

  const unlock = useCallback(async (password: string) => {
    const { handle, data } = await openVault(password);
    keyRef.current = handle;
    loginsRef.current = data.logins;
    setLogins(data.logins);
    lastActivity.current = Date.now();
    setStatus("unlocked");
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
    deleteVault();
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
      const left = AUTO_LOCK_SECONDS - Math.floor((Date.now() - lastActivity.current) / 1000);
      if (left <= 0) lock();
      else setLockInSeconds(left);
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(timer);
    };
  }, [status, lock]);

  // ----- Clipboard that clears itself -----
  const clipTimer = useRef<number | null>(null);

  const wipeClipboard = useCallback(async () => {
    if (clipTimer.current) window.clearInterval(clipTimer.current);
    clipTimer.current = null;
    try {
      await navigator.clipboard.writeText("");
      setClip({ label: "", secondsLeft: 0, message: "Clipboard cleared." });
    } catch {
      setClip({ label: "", secondsLeft: 0, message: "Couldn't clear the clipboard automatically (the tab wasn't in focus). Copy something else to overwrite it." });
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
        clip,
        create,
        unlock,
        lock,
        addLogins,
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
