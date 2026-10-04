// Face or fingerprint unlock through WebAuthn.
//
// A platform passkey (Windows Hello, Touch ID) is created with the PRF
// extension. Each unlock asks the authenticator to evaluate PRF on a stored
// salt; the operating system checks the face or fingerprint, and only then
// returns 32 secret bytes. Those bytes derive the key that unwraps the vault
// key. Tesseract never sees any face or fingerprint data, and there is no
// "verified" flag: without the PRF output the vault cannot be decrypted.

import { addBiometricWrap, fromB64, openWithPrf, removeBiometricWrap, storedBiometric, toB64, type VaultSession } from "./crypto";

export type BiometricSupport =
  | { available: true }
  | { available: false; reason: string; noBiometrics: boolean };

const PRF_UNSUPPORTED_KEY = "tesseract.prfUnsupported";

// Shown whenever face/fingerprint unlock can't be used (no passkeys, no
// built-in biometrics, or no WebAuthn PRF support).
const UNAVAILABLE = "Face/fingerprint unlock isn't available on this laptop's current setup.";
const NO_PRF_REASON = UNAVAILABLE;

function b64url(bytes: Uint8Array): string {
  return toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return fromB64(b64 + "===".slice((b64.length + 3) % 4));
}

type PrfResults = { enabled?: boolean; results?: { first?: BufferSource } };

function prfFrom(cred: PublicKeyCredential): PrfResults | undefined {
  return (cred.getClientExtensionResults() as { prf?: PrfResults }).prf;
}

function asArrayBuffer(src: BufferSource): ArrayBuffer {
  if (src instanceof ArrayBuffer) return src;
  const view = src as ArrayBufferView;
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice().buffer;
}

export async function checkBiometricSupport(): Promise<BiometricSupport> {
  if (typeof window === "undefined" || !window.PublicKeyCredential || !window.isSecureContext) {
    return { available: false, noBiometrics: true, reason: UNAVAILABLE };
  }
  let platform = false;
  try {
    platform = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    platform = false;
  }
  if (!platform) {
    return { available: false, noBiometrics: true, reason: UNAVAILABLE };
  }
  try {
    if (localStorage.getItem(PRF_UNSUPPORTED_KEY)) return { available: false, noBiometrics: false, reason: NO_PRF_REASON };
  } catch {
    /* ignore */
  }
  const getCaps = (PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> })
    .getClientCapabilities;
  if (getCaps) {
    try {
      const caps = await getCaps.call(PublicKeyCredential);
      if (caps["extension:prf"] === false) return { available: false, noBiometrics: false, reason: NO_PRF_REASON };
    } catch {
      /* unknown: try it */
    }
  }
  return { available: true };
}

export function biometricEnabled(): boolean {
  return storedBiometric() !== null;
}

/** The PRF evaluation itself: one face or fingerprint check. */
async function evaluatePrf(credentialId: string, prfSalt: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const cred = (await navigator.credentials.get({
    signal,
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: "public-key", id: fromB64url(credentialId), transports: ["internal"] }],
      userVerification: "required",
      timeout: 60_000,
      extensions: { prf: { eval: { first: fromB64(prfSalt) } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  const first = cred && prfFrom(cred)?.results?.first;
  if (!first) throw new Error("This passkey didn't return a PRF result.");
  return asArrayBuffer(first);
}

/** Creates the platform passkey and stores a PRF-wrapped copy of the vault key. */
export async function enableBiometric(session: VaultSession): Promise<void> {
  const prfSalt = crypto.getRandomValues(new Uint8Array(32));
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "Tesseract demo" },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: "Tesseract demo vault",
        displayName: "Tesseract demo vault",
      },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("No passkey was created.");

  const credentialId = b64url(new Uint8Array(cred.rawId));
  const prf = prfFrom(cred);
  if (!prf?.enabled) {
    try {
      localStorage.setItem(PRF_UNSUPPORTED_KEY, "1");
    } catch {
      /* ignore */
    }
    forgetCredential(credentialId);
    throw new Error(NO_PRF_REASON);
  }
  // Some authenticators return the PRF output at creation; others need one get().
  const first = prf.results?.first ? asArrayBuffer(prf.results.first) : await evaluatePrf(credentialId, toB64(prfSalt));
  await addBiometricWrap(session, first, credentialId, toB64(prfSalt));
}

export async function unlockWithBiometric(signal?: AbortSignal) {
  const bio = storedBiometric();
  if (!bio) throw new Error("Face or fingerprint unlock isn't turned on.");
  const prf = await evaluatePrf(bio.credentialId, bio.prfSalt, signal);
  try {
    return await openWithPrf(prf);
  } catch {
    throw new Error("Your face or fingerprint was accepted, but the passkey's key didn't open this vault.");
  }
}

export function disableBiometric(): void {
  const bio = storedBiometric();
  removeBiometricWrap();
  if (bio) forgetCredential(bio.credentialId);
}

/** Asks the browser to drop a passkey we no longer use, where supported. */
function forgetCredential(credentialId: string) {
  const signalUnknown = (
    PublicKeyCredential as unknown as { signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void> }
  ).signalUnknownCredential;
  signalUnknown?.call(PublicKeyCredential, { rpId: location.hostname, credentialId }).catch(() => {});
}

/** Readable message for a failed or cancelled check. */
export function describeBiometricError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") return "Face or fingerprint check was cancelled or timed out.";
    if (err.name === "AbortError") return "Face or fingerprint check was stopped.";
    if (err.name === "InvalidStateError") return "This passkey is already set up on this device.";
    if (err.name === "SecurityError") return "Passkeys aren't allowed on this address.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Face or fingerprint check failed.";
}
