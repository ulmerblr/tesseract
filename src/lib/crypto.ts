// All vault encryption happens here, in the browser, with Web Crypto.
//
// The vault is encrypted with a random AES-GCM-256 "vault key". That key is
// stored only in wrapped (encrypted) form, up to two ways:
//   1. wrapped by a key derived from the master password (PBKDF2-SHA256), and
//   2. optionally, wrapped by a key derived from a platform passkey's WebAuthn
//      PRF output (face or fingerprint unlock; see biometric.ts).
// Either one unwraps the same vault key. The master password is never stored.

import type { VaultData } from "./types";

export const PBKDF2_ITERATIONS = 600_000;
const STORAGE_KEY = "tesseract.vault.v2";
// Format used before biometric unlock existed. Found → wiped, back to setup.
const LEGACY_STORAGE_KEY = "tesseract.vault.v1";

type Wrapped = { iv: string; wrappedKey: string };

export type BiometricWrap = Wrapped & {
  credentialId: string;
  prfSalt: string;
  enabledAt: number;
};

type StoredVault = {
  v: 2;
  vault: { iv: string; ciphertext: string };
  password: Wrapped & { kdf: "PBKDF2-SHA256"; iterations: number; salt: string };
  biometric?: BiometricWrap;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function readStored(): StoredVault | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredVault) : null;
    return parsed?.v === 2 ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(stored: StoredVault): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export function vaultExists(): boolean {
  return readStored() !== null;
}

export function legacyVaultExists(): boolean {
  try {
    return localStorage.getItem(LEGACY_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function deleteVault(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function storedBiometric(): BiometricWrap | null {
  return readStored()?.biometric ?? null;
}

// ----- Key handling -----

/** Kept in memory only while unlocked; cleared on lock. */
export type VaultSession = { vaultKey: CryptoKey };

export class WrongPasswordError extends Error {}

async function passwordKek(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/** Turns the 32-byte WebAuthn PRF output into a key-wrapping key. */
export async function prfKek(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode("tesseract/vault-key-wrap/v2") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

async function wrap(vaultKey: CryptoKey, kek: CryptoKey): Promise<Wrapped> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey("raw", vaultKey, kek, { name: "AES-GCM", iv });
  return { iv: toB64(iv), wrappedKey: toB64(new Uint8Array(wrapped)) };
}

async function unwrap(w: Wrapped, kek: CryptoKey): Promise<CryptoKey> {
  // Extractable so it can be wrapped again when face/fingerprint is turned on.
  return crypto.subtle.unwrapKey(
    "raw",
    fromB64(w.wrappedKey),
    kek,
    { name: "AES-GCM", iv: fromB64(w.iv) },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

async function encryptVault(vaultKey: CryptoKey, data: VaultData): Promise<StoredVault["vault"]> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, vaultKey, enc.encode(JSON.stringify(data)));
  return { iv: toB64(iv), ciphertext: toB64(new Uint8Array(ct)) };
}

async function decryptVault(vaultKey: CryptoKey, stored: StoredVault): Promise<VaultData> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(stored.vault.iv) },
    vaultKey,
    fromB64(stored.vault.ciphertext),
  );
  return JSON.parse(dec.decode(plain)) as VaultData;
}

// ----- Public operations -----

export async function createVault(password: string): Promise<{ session: VaultSession; data: VaultData }> {
  const vaultKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await passwordKek(password, salt, PBKDF2_ITERATIONS);
  const data: VaultData = { logins: [] };
  writeStored({
    v: 2,
    vault: await encryptVault(vaultKey, data),
    password: { kdf: "PBKDF2-SHA256", iterations: PBKDF2_ITERATIONS, salt: toB64(salt), ...(await wrap(vaultKey, kek)) },
  });
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return { session: { vaultKey }, data };
}

export async function saveVault(session: VaultSession, data: VaultData): Promise<void> {
  const stored = readStored();
  if (!stored) throw new Error("No vault found on this laptop.");
  writeStored({ ...stored, vault: await encryptVault(session.vaultKey, data) });
}

export async function openWithPassword(password: string): Promise<{ session: VaultSession; data: VaultData }> {
  const stored = readStored();
  if (!stored) throw new Error("No vault found on this laptop.");
  const kek = await passwordKek(password, fromB64(stored.password.salt), stored.password.iterations);
  let vaultKey: CryptoKey;
  try {
    vaultKey = await unwrap(stored.password, kek);
  } catch {
    // AES-GCM authentication fails when the key is wrong.
    throw new WrongPasswordError("Wrong master password.");
  }
  return { session: { vaultKey }, data: await decryptVault(vaultKey, stored) };
}

/** Opens the vault with a key derived from the passkey's PRF output. */
export async function openWithPrf(prfOutput: ArrayBuffer): Promise<{ session: VaultSession; data: VaultData }> {
  const stored = readStored();
  if (!stored?.biometric) throw new Error("Face or fingerprint unlock isn't turned on.");
  const vaultKey = await unwrap(stored.biometric, await prfKek(prfOutput));
  return { session: { vaultKey }, data: await decryptVault(vaultKey, stored) };
}

/** Stores a second copy of the vault key, wrapped by the passkey's PRF key. */
export async function addBiometricWrap(
  session: VaultSession,
  prfOutput: ArrayBuffer,
  credentialId: string,
  prfSalt: string,
): Promise<void> {
  const stored = readStored();
  if (!stored) throw new Error("No vault found on this laptop.");
  const w = await wrap(session.vaultKey, await prfKek(prfOutput));
  writeStored({ ...stored, biometric: { ...w, credentialId, prfSalt, enabledAt: Date.now() } });
}

export function removeBiometricWrap(): void {
  const stored = readStored();
  if (!stored) return;
  delete stored.biometric;
  writeStored(stored);
}
