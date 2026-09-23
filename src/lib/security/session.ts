import crypto from "node:crypto";
import { getEnv } from "@/lib/env";

export const VERIFIED_COOKIE_NAME = "tsv";
const DEFAULT_TTL_MS = 24 * 3_600_000;

function sign(payload: string): string {
  return crypto.createHmac("sha256", getEnv().SESSION_SECRET).update(payload).digest("base64url");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/** Marks this visitor as having passed the bot check, so later requests skip re-verifying. */
export function issueVerifiedCookie(visitorId: string, now: Date = new Date(), ttlMs = DEFAULT_TTL_MS): string {
  const expires = now.getTime() + ttlMs;
  const payload = `${visitorId}.${expires}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${VERIFIED_COOKIE_NAME}=${payload}.${sign(payload)}; Path=/; Max-Age=${Math.floor(ttlMs / 1000)}; HttpOnly; SameSite=Lax${secure}`;
}

/** Bound to one visitor id, so the cookie cannot be replayed for a different visitor. */
export function isVerified(cookieValue: string | undefined, visitorId: string, now: Date = new Date()): boolean {
  if (!cookieValue) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return false;
  const [id, expiresStr, sig] = parts;
  if (id !== visitorId) return false;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < now.getTime()) return false;
  return timingSafeEqualStr(sig, sign(`${id}.${expiresStr}`));
}
