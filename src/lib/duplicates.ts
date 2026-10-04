// Duplicate detection and merging.
//
// Two logins are the same account when the usernames match (ignoring case) and
// the websites share a main domain (portal.gulfshorecu.example and
// gulfshorecu.example count as one). Without a website on one side, a matching
// username plus a closely matching name is only a POSSIBLE duplicate.

import type { DraftLogin, Login, LoginFields, SecurityQA } from "./types";

export type MatchKind = "same" | "possible";

// Public suffixes with two labels, so "shop.example.co.uk" → "example.co.uk".
const TWO_LABEL_SUFFIXES = new Set(["co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp", "com.br", "com.mx", "co.in"]);

function hostOf(s: string): string {
  const t = s.trim().toLowerCase();
  if (!t) return "";
  const host = t.replace(/^[a-z]+:\/\//, "").split(/[/?#:]/)[0].replace(/^www\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : "";
}

/** "https://portal.gulfshorecu.org/login" → "gulfshorecu.org"; "" when there's no web address. */
export function mainDomain(l: Pick<LoginFields, "url" | "site">): string {
  const host = hostOf(l.url) || hostOf(l.site);
  if (!host) return "";
  const parts = host.split(".");
  const lastTwo = parts.slice(-2).join(".");
  return TWO_LABEL_SUFFIXES.has(lastTwo) && parts.length > 2 ? parts.slice(-3).join(".") : lastTwo;
}

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));

/** Names a login could go by: its name, plus its domain's main label. */
function namesOf(l: Pick<LoginFields, "url" | "site">): string[] {
  const names = [l.site];
  const d = mainDomain(l);
  if (d) names.push(d.split(".")[0]);
  return names.filter((n) => compact(n).length > 0);
}

function namesClose(a: Pick<LoginFields, "url" | "site">, b: Pick<LoginFields, "url" | "site">): boolean {
  for (const x of namesOf(a)) {
    for (const y of namesOf(b)) {
      const cx = compact(x);
      const cy = compact(y);
      if (cx === cy) return true;
      if (Math.min(cx.length, cy.length) >= 4 && (cx.includes(cy) || cy.includes(cx))) return true;
      const tx = tokens(x);
      const ty = tokens(y);
      const shared = [...tx].filter((t) => ty.has(t)).length;
      if (shared && shared / Math.min(tx.size, ty.size) >= 0.5) return true;
    }
  }
  return false;
}

export function matchLogins(a: LoginFields, b: LoginFields): MatchKind | null {
  const ua = a.username.trim().toLowerCase();
  if (!ua || ua !== b.username.trim().toLowerCase()) return null;
  const da = mainDomain(a);
  const db = mainDomain(b);
  if (da && db) return da === db ? "same" : null;
  // Neither has a web address but the names are identical: the same entry again.
  if (!da && !db && compact(a.site) && compact(a.site) === compact(b.site)) return "same";
  return namesClose(a, b) ? "possible" : null;
}

// ----- Merging -----

const sameText = (a: string, b: string) => a.trim() === b.trim();
const sameQA = (a: SecurityQA, b: SecurityQA) =>
  a.question.trim().toLowerCase() === b.question.trim().toLowerCase() && a.answer.trim() === b.answer.trim();

function unionText(into: string[], from: string[]): string[] {
  const out = [...into];
  for (const f of from) if (f.trim() && !out.some((x) => sameText(x, f))) out.push(f.trim());
  return out;
}

/** Adds the other login's security questions, hints and notes, with no exact repeats. */
export function mergeExtras<T extends LoginFields>(target: T, other: LoginFields): T {
  const questions = [...target.questions];
  for (const q of other.questions) if ((q.question || q.answer) && !questions.some((x) => sameQA(x, q))) questions.push(q);
  return {
    ...target,
    site: target.site || other.site,
    url: target.url || other.url,
    hints: unionText(target.hints, other.hints),
    questions,
    notes: unionText(target.notes, other.notes),
  };
}

export function today(): string {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Swaps in a new password, keeping the old one in the notes with the date it was replaced. */
export function withPassword<T extends LoginFields>(target: T, password: string): T {
  if (target.password === password) return target;
  const notes = target.password ? unionText(target.notes, [`Previous password: ${target.password} (replaced ${today()})`]) : target.notes;
  return { ...target, password, notes };
}

// ----- Import planning -----

export type Target = { kind: "vault"; id: string } | { kind: "draft"; key: string };

export type DraftPlan =
  | { status: "new" }
  | { status: "possible"; target: Target; targetName: string }
  | { status: "skip" | "conflict"; target: Target; targetName: string; targetPassword: string; inFile: boolean };

/** Works out, row by row, which incoming logins are new and which match one already saved or earlier in the file. */
export function planImport(drafts: DraftLogin[], vault: Login[], sameAccount: Set<string>): Map<string, DraftPlan> {
  type Rec = { target: Target; fields: LoginFields };
  const records: Rec[] = vault.map((l) => ({ target: { kind: "vault", id: l.id }, fields: l }));
  const plans = new Map<string, DraftPlan>();

  for (const d of drafts) {
    let possible: Rec | null = null;
    let same: Rec | null = null;
    for (const r of records) {
      const m = matchLogins(d, r.fields);
      if (m === "same") {
        same = r;
        break;
      }
      if (m === "possible" && !possible) possible = r;
    }
    // A possible duplicate the person confirmed is treated like a sure one.
    if (!same && possible && sameAccount.has(d.key)) same = possible;

    if (same) {
      const inFile = same.target.kind === "draft";
      const base = { target: same.target, targetName: same.fields.site || same.fields.url, targetPassword: same.fields.password, inFile };
      plans.set(d.key, same.fields.password === d.password ? { status: "skip", ...base } : { status: "conflict", ...base });
      continue;
    }
    plans.set(d.key, possible ? { status: "possible", target: possible.target, targetName: possible.fields.site || possible.fields.url } : { status: "new" });
    records.push({ target: { kind: "draft", key: d.key }, fields: d });
  }
  return plans;
}

export type ImportResult = { logins: Login[]; added: number; updated: number; skipped: number };

/** Applies the plan: new rows are added, matches merge into what they matched. */
export function applyImport(
  drafts: DraftLogin[],
  plans: Map<string, DraftPlan>,
  updateChoice: Map<string, "keep" | "update">,
  vault: Login[],
  clean: (f: LoginFields) => LoginFields,
  newId: () => string,
): ImportResult {
  const now = Date.now();
  const vaultById = new Map(vault.map((l) => [l.id, { ...l }]));
  const touched = new Set<string>();
  const newByKey = new Map<string, LoginFields>();
  let skipped = 0;

  for (const d of drafts) {
    const plan = plans.get(d.key) ?? { status: "new" };
    const fields = clean(d);
    if (plan.status === "new" || plan.status === "possible") {
      newByKey.set(d.key, fields);
      continue;
    }
    const merge = <T extends LoginFields>(t: T): T => {
      let next = mergeExtras(t, fields);
      if (plan.status === "conflict" && updateChoice.get(d.key) === "update") next = withPassword(next, fields.password);
      return next;
    };
    if (plan.status === "skip") skipped++;
    if (plan.target.kind === "vault") {
      const t = vaultById.get(plan.target.id);
      if (t) {
        vaultById.set(t.id, { ...merge(t), updatedAt: now });
        touched.add(t.id);
      }
    } else {
      const t = newByKey.get(plan.target.key);
      if (t) newByKey.set(plan.target.key, merge(t));
    }
  }

  const added = [...newByKey.values()].map((f) => ({ ...f, id: newId(), createdAt: now, updatedAt: now }));
  // Count only saved logins that actually changed.
  const updated = [...touched].filter((id) => JSON.stringify(stripTimes(vaultById.get(id)!)) !== JSON.stringify(stripTimes(vault.find((l) => l.id === id)!))).length;
  return { logins: [...vault.map((l) => vaultById.get(l.id)!), ...added], added: added.length, updated, skipped };
}

function stripTimes(l: Login) {
  const { updatedAt: _u, createdAt: _c, ...rest } = l;
  void _u;
  void _c;
  return rest;
}

// ----- Find Duplicates in the vault -----

export type DuplicateGroup = { key: string; kind: MatchKind; logins: Login[] };

export const groupKey = (ids: string[]) => [...ids].sort().join(",");

export function findDuplicateGroups(logins: Login[], dismissed: string[]): DuplicateGroup[] {
  const parent = logins.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const possibleEdge = new Set<number>();
  for (let i = 0; i < logins.length; i++) {
    for (let j = i + 1; j < logins.length; j++) {
      const m = matchLogins(logins[i], logins[j]);
      if (!m) continue;
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) parent[ri] = rj;
      if (m === "possible") possibleEdge.add(i).add(j);
    }
  }
  const groups = new Map<number, number[]>();
  logins.forEach((_, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });
  const dismissedSet = new Set(dismissed);
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      key: groupKey(g.map((i) => logins[i].id)),
      kind: (g.some((i) => possibleEdge.has(i)) ? "possible" : "same") as MatchKind,
      logins: g.map((i) => logins[i]),
    }))
    .filter((g) => !dismissedSet.has(g.key));
}

/** Merges a group into the login whose password was chosen; returns the new full list. */
export function mergeGroup(all: Login[], group: Login[], keepId: string): Login[] {
  const keep = group.find((l) => l.id === keepId);
  if (!keep) return all;
  let merged: Login = { ...keep };
  for (const other of group) {
    if (other.id === keepId) continue;
    merged = mergeExtras(merged, other);
    if (other.password && other.password !== merged.password) {
      merged.notes = unionText(merged.notes, [`Other password from a merged duplicate: ${other.password} (merged ${today()})`]);
    }
  }
  merged.updatedAt = Date.now();
  const drop = new Set(group.map((l) => l.id).filter((id) => id !== keepId));
  return all.filter((l) => !drop.has(l.id)).map((l) => (l.id === keepId ? merged : l));
}
