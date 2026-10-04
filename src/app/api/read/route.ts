import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { clientFor, describeError, isAllowedModel, json } from "@/lib/server/claude";

// Reading a messy document can take a while, especially on Opus.
export const maxDuration = 120;

const MAX_CHARS = 200_000;

const LoginSchema = z.object({
  site: z.string(),
  url: z.string(),
  username: z.string(),
  password: z.string(),
  hints: z.array(z.string()),
  securityQuestions: z.array(z.object({ question: z.string(), answer: z.string() })),
  notes: z.array(z.string()),
  uncertain: z.boolean(),
  uncertainReason: z.string(),
});
const ResultSchema = z.object({ logins: z.array(LoginSchema) });

const SYSTEM = `You read a person's own exported or hand-written list of website logins and turn it into structured entries for their password manager. This is a product demo; the data is invented.

For every account in the document, return one entry:
- site: the human-friendly name of the website or company (e.g. "Bramblewood Bank"), not a sentence.
- url: the web address if one is given, otherwise "".
- username: the login name, email or member ID.
- password: exactly as written. Never invent or "fix" a password.
- hints: password hints, as written.
- securityQuestions: each security question with its answer.
- notes: anything else worth keeping about the account (old passwords, account numbers, reminders).
- uncertain: true when you had to guess (several candidate passwords, the writer sounds unsure, the site or username is missing or ambiguous, a column you couldn't interpret). Put a short plain-English reason in uncertainReason, otherwise "".

Skip lines that aren't accounts (titles, stray reminders). Use "" or [] for anything missing; never make values up.`;

export async function POST(request: Request) {
  let body: { apiKey?: unknown; model?: unknown; text?: unknown; kind?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const { apiKey, model, text, kind } = body;
  if (typeof apiKey !== "string" || !apiKey.trim()) return json({ error: "No API key was sent." }, 400);
  if (!isAllowedModel(model)) return json({ error: "Unknown model." }, 400);
  if (typeof text !== "string" || !text.trim()) return json({ error: "The file had no readable text." }, 400);
  if (text.length > MAX_CHARS) return json({ error: "That file is too large for the demo reader." }, 413);

  const source = kind === "word" ? "a Word document of free-form notes" : "a spreadsheet exported as CSV";

  try {
    // Only the model chosen on the Admin page; no fallback to another model.
    const response = await clientFor(apiKey.trim()).messages.parse({
      model,
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(ResultSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Here is ${source}. Extract every login.\n\n<document>\n${text}\n</document>`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: `${model} declined to read this file. Try the other model, or clear the key on the Admin page to use the simulated reader.` }, 422);
    }
    if (response.stop_reason === "max_tokens") {
      return json({ error: "The file was too long for one pass. Try a smaller file." }, 422);
    }
    if (!response.parsed_output) {
      return json({ error: "Claude's answer couldn't be understood. Try again." }, 502);
    }
    return json({ logins: response.parsed_output.logins, model: response.model });
  } catch (err) {
    const { status, message } = describeError(err);
    return json({ error: message }, status);
  }
}
