// Server-only helpers for the two Claude routes.
// The API key arrives with each request from the browser and is used for that
// one call only. Nothing here logs or stores the key or the file contents.

import Anthropic from "@anthropic-ai/sdk";

export const ALLOWED_MODELS = ["claude-sonnet-5-5", "claude-opus-5-5"] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];

export function isAllowedModel(m: unknown): m is AllowedModel {
  return typeof m === "string" && (ALLOWED_MODELS as readonly string[]).includes(m);
}

export function clientFor(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 1 });
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Turns an SDK error into a short, safe message for the browser. */
export function describeError(err: unknown): { status: number; message: string } {
  if (err instanceof Anthropic.AuthenticationError) return { status: 401, message: "Anthropic rejected the API key (401). Check that it was pasted correctly." };
  if (err instanceof Anthropic.PermissionDeniedError) return { status: 403, message: "This API key doesn't have permission to use that model (403)." };
  if (err instanceof Anthropic.NotFoundError) return { status: 404, message: "Model not found for this key (404). Try the other model." };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: "Rate limited by Anthropic (429). Wait a moment and try again." };
  if (err instanceof Anthropic.BadRequestError) return { status: 400, message: `Anthropic said the request was invalid: ${err.message}` };
  if (err instanceof Anthropic.APIConnectionError) return { status: 502, message: "Couldn't reach Anthropic. Try again." };
  if (err instanceof Anthropic.APIError) return { status: 502, message: `Anthropic error${err.status ? ` ${err.status}` : ""}: ${err.message}` };
  return { status: 500, message: "Something went wrong reading the file." };
}
