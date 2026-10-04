export type SecurityQA = { question: string; answer: string };

export type LoginFields = {
  site: string;
  url: string;
  username: string;
  password: string;
  hints: string[];
  questions: SecurityQA[];
  notes: string[];
};

export type Login = LoginFields & {
  id: string;
  createdAt: number;
  updatedAt: number;
};

/** A login found by a reader, before it is imported. */
export type DraftLogin = LoginFields & {
  key: string;
  flagged: boolean;
  flagReason: string;
};

export type VaultData = { logins: Login[] };

export function emptyFields(): LoginFields {
  return { site: "", url: "", username: "", password: "", hints: [], questions: [], notes: [] };
}

export function newId(): string {
  return crypto.randomUUID();
}
