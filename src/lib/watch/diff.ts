import crypto from "node:crypto";

/**
 * Strips content that changes on every render without meaning anything changed: request ids,
 * timestamps, session-ish tokens. Keeps the check from crying wolf on noise.
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function hashText(text: string): string {
  return crypto.createHash("sha256").update(normalizeText(text)).digest("hex");
}

export interface CheckOutcome {
  changed: boolean;
  isFirstCheck: boolean;
  hash: string;
}

/** Pure decision logic, kept separate from fetching so it is trivially unit-testable. */
export function evaluateCheck(text: string, previousHash: string | null): CheckOutcome {
  const hash = hashText(text);
  return { changed: previousHash !== null && hash !== previousHash, isFirstCheck: previousHash === null, hash };
}
