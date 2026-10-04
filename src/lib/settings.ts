// Admin settings live in this browser's localStorage only.

export const MODELS = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];
export const DEFAULT_MODEL: ModelId = "claude-sonnet-5-5";

const KEY_STORAGE = "tesseract.anthropicKey";
const MODEL_STORAGE = "tesseract.model";

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage unavailable */
  }
}

export function getModel(): ModelId {
  try {
    const m = localStorage.getItem(MODEL_STORAGE);
    return MODELS.some((x) => x.id === m) ? (m as ModelId) : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function setModel(model: ModelId): void {
  try {
    localStorage.setItem(MODEL_STORAGE, model);
  } catch {
    /* storage unavailable */
  }
}

export function maskKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 7)}…${key.slice(-4)}` : "••••";
}
