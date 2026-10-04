// All vault encryption happens here, in the browser, with Web Crypto.
// PBKDF2-SHA256 turns the master password into an AES-GCM-256 key.
// The master password is never stored; only the encrypted blob is.

import type { VaultData } from "./types";

export const PBKDF2_ITERATIONS = 600_000;
const STORAGE_KEY = "tesseract.vault.v1";

type StoredVault = {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function readStored(): StoredVault | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredVault) : null;
  } catch {
    return null;
  }
}

export function vaultExists(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function deleteVault(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Opaque handle kept in memory while unlocked. Cleared on lock. */
export type VaultKey = { key: CryptoKey; salt: Uint8Array<ArrayBuffer>; iterations: number };

export async function saveVault(handle: VaultKey, data: VaultData): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, handle.key, enc.encode(JSON.stringify(data)));
  const stored: StoredVault = {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iterations: handle.iterations,
    salt: toB64(handle.salt),
    iv: toB64(iv),
    ciphertext: toB64(new Uint8Array(ct)),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export async function createVault(password: string): Promise<{ handle: VaultKey; data: VaultData }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const handle = { key, salt, iterations: PBKDF2_ITERATIONS };
  const data: VaultData = { logins: [] };
  await saveVault(handle, data);
  return { handle, data };
}

export class WrongPasswordError extends Error {}

export async function openVault(password: string): Promise<{ handle: VaultKey; data: VaultData }> {
  const stored = readStored();
  if (!stored) throw new Error("No vault found in this browser.");
  const salt = fromB64(stored.salt);
  const key = await deriveKey(password, salt, stored.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(stored.iv) }, key, fromB64(stored.ciphertext));
  } catch {
    // AES-GCM authentication fails when the key is wrong.
    throw new WrongPasswordError("Wrong master password.");
  }
  const data = JSON.parse(dec.decode(plain)) as VaultData;
  return { handle: { key, salt, iterations: stored.iterations }, data };
}
