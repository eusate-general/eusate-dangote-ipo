export type RedactionKind = "email" | "phone" | "card" | "account" | "id" | "secret";
export type Redactions = Partial<Record<RedactionKind, number>>;

export interface RedactResult {
  text: string;
  redactions: Redactions;
  changed: boolean;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?<!\d)(?:\+?234|0)[789][01]\d{8}(?!\d)/g;
const CARD = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;
const ID_11 = /(?<!\d)\d{11}(?!\d)/g; // BVN or NIN
const ACCOUNT_10 = /(?<!\d)\d{10}(?!\d)/g; // NUBAN account number
// A secret keyword followed by a value that contains at least one digit.
const SECRET =
  /\b(otp|pin|cvv|cvc|password|passcode)\b[^\S\r\n]*(?:is|=|:)?[^\S\r\n]*[A-Za-z0-9!@#$%^&*_-]*\d[A-Za-z0-9!@#$%^&*_-]*/gi;

/**
 * Removes obvious personal identifiers before text reaches the model or the database.
 * Heuristic by design: it favours removing too much over leaking a BVN, card or OTP.
 */
export function redactPii(input: string): RedactResult {
  const redactions: Redactions = {};
  const bump = (kind: RedactionKind) => {
    redactions[kind] = (redactions[kind] ?? 0) + 1;
  };

  let text = input.replace(EMAIL, () => {
    bump("email");
    return "[email removed]";
  });
  text = text.replace(PHONE, () => {
    bump("phone");
    return "[phone number removed]";
  });
  text = text.replace(CARD, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) return match;
    bump("card");
    return "[card number removed]";
  });
  text = text.replace(ID_11, () => {
    bump("id");
    return "[11-digit ID number removed]";
  });
  text = text.replace(ACCOUNT_10, () => {
    bump("account");
    return "[account number removed]";
  });
  text = text.replace(SECRET, (_m, keyword: string) => {
    bump("secret");
    return `${keyword} [secret removed]`;
  });

  return { text, redactions, changed: text !== input };
}
