import { clientFor, describeError, isAllowedModel, json } from "@/lib/server/claude";

// One tiny call to prove the key and model work. Never logs the key.
export async function POST(request: Request) {
  let apiKey: unknown, model: unknown;
  try {
    ({ apiKey, model } = await request.json());
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }
  if (typeof apiKey !== "string" || !apiKey.trim()) return json({ ok: false, error: "No API key was sent." }, 400);
  if (!isAllowedModel(model)) return json({ ok: false, error: "Unknown model." }, 400);

  try {
    const response = await clientFor(apiKey.trim()).messages.create({
      model,
      max_tokens: 64,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
    });
    return json({ ok: true, model: response.model });
  } catch (err) {
    const { status, message } = describeError(err);
    return json({ ok: false, error: message }, status);
  }
}
