// The simulated reader: no AI, just column-header matching for spreadsheets
// and pattern matching for free-form Word notes.

import type { DraftLogin, SecurityQA } from "./types";
import { newId } from "./types";

type Field = "site" | "url" | "username" | "password" | "hint" | "question" | "answer" | "notes";

// Checked in order; the first match wins (so "secret Q" is a question, not a password).
const HEADER_PATTERNS: [Field, RegExp][] = [
  ["question", /(sec(urity)?\.?\s*q|question|secret\s*q)/i],
  ["answer", /(^|\W)(ans|answer|a\d*)(\W|$)|answer/i],
  ["hint", /hint|reminder|clue/i],
  ["notes", /note|comment|other|misc|extra|memo|remarks/i],
  ["url", /url|link|web\s*addr|web\s*site|domain|address|^web$|^site$/i],
  ["username", /user|login|e-?mail|member|\bid\b|handle/i],
  ["password", /pass|^pw|pwd|secret|pin\b|code/i],
  ["site", /site|name|acct|account|service|company|title|where|what|app/i],
];

export function matchHeader(header: string): Field | null {
  const h = header.trim();
  if (!h) return null;
  for (const [field, re] of HEADER_PATTERNS) if (re.test(h)) return field;
  return null;
}

function draft(partial: Partial<DraftLogin>): DraftLogin {
  return {
    key: newId(),
    site: "",
    url: "",
    username: "",
    password: "",
    hints: [],
    questions: [],
    notes: [],
    flagged: false,
    flagReason: "",
    ...partial,
  };
}

/** Names a site by its web address, e.g. "https://www.larkspuroutfitters.example/login" → "larkspuroutfitters.example". */
function siteFromUrl(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

const looksLikeDomain = (s: string) => /^[\w-]+(\.[\w-]+)+$/.test(s.trim());

/** Pulls hints and security Q&As out of a free-text note. Returns what is left over. */
export function mineNote(text: string): { hints: string[]; questions: SecurityQA[]; rest: string[] } {
  const hints: string[] = [];
  const questions: SecurityQA[] = [];
  const rest: string[] = [];
  for (const raw of text.split(/\s*(?:\n|\||;)\s*/)) {
    const part = raw.trim();
    if (!part) continue;
    // A security question can start partway through ("Sam's account — Security Q: ...").
    const at = part.search(/(security\s*q|sec\s*q|\bq\s*:)/i);
    const qa = at >= 0 ? matchQA(part.slice(at)) : null;
    if (qa) {
      questions.push(qa);
      const before = part.slice(0, at).replace(/[\s\-–—:,]+$/, "");
      if (before) rest.push(before);
      continue;
    }
    const hint = part.match(/^hint\s*[:=\-–—]\s*(.+)$/i);
    if (hint) {
      hints.push(hint[1].trim());
      continue;
    }
    rest.push(part.replace(/^notes?\s*[:=\-–—]\s*/i, ""));
  }
  return { hints, questions, rest };
}

function matchQA(line: string): SecurityQA | null {
  const m =
    line.match(/^(?:security\s*q(?:uestion)?|sec\s*q|q)\s*\d*\s*[:=\-–—.]?\s*(.+?)\s*(?:answer|ans|a)\s*[:=\-–—]\s*(.+)$/i) ??
    line.match(/^(?:security\s*q(?:uestion)?|sec\s*q)\s*\d*\s*[:=\-–—.]?\s*(.+?)\s+[–—]\s+(.+)$/i);
  if (!m) return null;
  return { question: m[1].replace(/[\s\-–—:]+$/, "").trim(), answer: m[2].trim() };
}

function flagIfIncomplete(d: DraftLogin): DraftLogin {
  const reasons: string[] = [];
  if (!d.site && !d.url) reasons.push("no website found");
  if (!d.username) reasons.push("no username found");
  if (!d.password) reasons.push("no password found");
  else if (/\?{2,}|\bor\b/i.test(d.password)) reasons.push("password looks uncertain");
  if (reasons.length) {
    d.flagged = true;
    d.flagReason = [d.flagReason, ...reasons].filter(Boolean).join("; ");
  }
  return d;
}

// ---------- Spreadsheets and CSV ----------

export function readSheet(rows: string[][]): DraftLogin[] {
  // Find the header row: the one in the first 10 rows with the most recognised headers.
  let headerIdx = -1;
  let best = 1;
  rows.slice(0, 10).forEach((r, i) => {
    const score = new Set(r.map(matchHeader).filter(Boolean)).size;
    if (score > best) {
      best = score;
      headerIdx = i;
    }
  });
  if (headerIdx < 0) return [];

  const headers = rows[headerIdx];
  const fields = headers.map(matchHeader);
  const out: DraftLogin[] = [];

  for (const row of rows.slice(headerIdx + 1)) {
    if (!row.some((c) => c.trim())) continue;
    // A repeated header row (e.g. a second sheet) resets nothing; just skip it.
    if (row.every((c, i) => c === headers[i])) continue;

    const d = draft({});
    const qs: string[] = [];
    const as: string[] = [];
    const unmatched: string[] = [];

    row.forEach((cell, i) => {
      const value = cell.trim();
      if (!value) return;
      const field = fields[i];
      switch (field) {
        case "site":
          // The name comes from one account/name column only; never glue other columns onto it.
          if (!d.site) d.site = value;
          else d.notes.push(`${headers[i]}: ${value}`);
          break;
        case "url":
          if (!d.url) d.url = value;
          else d.notes.push(`${headers[i]}: ${value}`);
          break;
        case "username":
          d.username = d.username || value;
          break;
        case "password":
          d.password = d.password || value;
          break;
        case "hint":
          d.hints.push(value);
          break;
        case "question":
          qs.push(value);
          break;
        case "answer":
          as.push(value);
          break;
        case "notes": {
          const mined = mineNote(value);
          d.hints.push(...mined.hints);
          d.questions.push(...mined.questions);
          d.notes.push(...mined.rest);
          break;
        }
        default:
          unmatched.push(`${headers[i] || "Unlabelled column"}: ${value}`);
      }
    });

    for (let i = 0; i < Math.max(qs.length, as.length); i++) {
      d.questions.push({ question: qs[i] ?? "", answer: as[i] ?? "" });
    }
    if (unmatched.length) {
      d.notes.push(...unmatched);
      d.flagged = true;
      d.flagReason = "some columns weren't recognised (kept in notes)";
    }
    if (!d.site && d.url) d.site = siteFromUrl(d.url);
    if (looksLikeDomain(d.site)) {
      // Google's export uses the web address as the name; keep it as the address.
      if (!d.url) d.url = d.site;
      d.site = siteFromUrl(d.site);
    }
    out.push(flagIfIncomplete(d));
  }
  return out;
}

// ---------- Word documents ----------

const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+(?:example|com|net|org|io|co))\b(?!@)/i;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/;
const USER_RE = /\b(?:user\s*name|username|user|login|log\s*in|member\s*(?:id|#|number)|account\s*(?:name|id)|email|e-mail)\b\s*(?:is|:|=|-|–|—)?\s*([^\s,;]+)/i;
const PASS_RE = /\b(?:password|passwd|pass|pwd|pw)\b\s*(?:is|:|=|-|–|—)?\s*(.+)$/i;

const GENERIC_NAMES = /^(bank|email|e-mail|mail|site|website|login|account)$/i;

export function readWord(text: string): DraftLogin[] {
  const blocks = text
    .replace(/\r/g, "")
    .split(/\n\s*\n+/)
    .map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((b) => b.length);

  const out: DraftLogin[] = [];
  for (const lines of blocks) {
    const d = draft({});
    const leftover: string[] = [];
    let uncertainWords = false;

    lines.forEach((line, idx) => {
      if (/\b(i think|not sure|maybe|or was it|\?\?)/i.test(line)) uncertainWords = true;

      const qa = matchQA(line);
      if (qa) {
        d.questions.push(qa);
        return;
      }
      const hint = line.match(/^hint\s*(?:is|:|=|-|–|—)\s*(.+)$/i);
      if (hint) {
        d.hints.push(hint[1].trim());
        return;
      }
      const note = line.match(/^notes?\s*(?:is|:|=|-|–|—)\s*(.+)$/i);
      if (note) {
        d.notes.push(note[1].trim());
        return;
      }

      let used = false;
      const pass = line.match(PASS_RE);
      if (pass && !d.password && !/^(old|previous)/i.test(line)) {
        // Keep only the first token unless the value is clearly uncertain.
        const value = pass[1].trim();
        d.password = /\bor\b|\?\?/i.test(value) ? value : value.split(/\s+/)[0];
        used = true;
      }
      const user = line.match(USER_RE);
      if (user && !d.username && user.index !== undefined && (!pass || user.index < (pass.index ?? 0))) {
        d.username = user[1].replace(/[.,]$/, "");
        used = true;
      } else if (!d.username) {
        const email = line.match(EMAIL_RE);
        if (email) {
          d.username = email[0];
          used = true;
        }
      }
      const url = line.replace(EMAIL_RE, "").match(URL_RE);
      if (url && !d.url) {
        d.url = url[1].toLowerCase();
        if (idx > 0 && line.trim().toLowerCase() === url[0].toLowerCase()) used = true;
      }

      if (idx === 0 && !d.site) {
        // First line of a block is usually the site's name.
        const name = line
          .replace(URL_RE, "")
          .replace(/[()[\]]/g, " ")
          .replace(/^(bank|email|site|acct|account)\s*[-–—:]\s*/i, "")
          .split(/\s+[-–—|]\s+|:/)[0]
          .trim();
        if (name && !pass && !user) {
          d.site = name;
          used = true;
        }
      }
      if (!used) leftover.push(line);
    });

    // A block with no login details at all (a title, a stray note) is skipped,
    // and so is a stray line like "Wi-Fi password is on the router".
    if (!d.username && !d.password) continue;
    if (!d.username && !d.url && !d.site) continue;

    d.notes.push(...leftover.filter((l) => l !== d.site && !l.toLowerCase().includes(d.url || "\u0000")));
    if (d.url && (!d.site || GENERIC_NAMES.test(d.site))) d.site = siteFromUrl(d.url);
    if (uncertainWords) {
      d.flagged = true;
      d.flagReason = "the notes sound unsure";
    }
    out.push(flagIfIncomplete(d));
  }
  return out;
}
