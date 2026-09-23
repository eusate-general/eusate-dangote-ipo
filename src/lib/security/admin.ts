import crypto from "node:crypto";
import { getEnv } from "@/lib/env";

export const ADMIN_COOKIE_NAME = "admin";
const TTL_MS = 12 * 3_600_000;

function sign(payload: string): string {
  return crypto.createHmac("sha256", getEnv().SESSION_SECRET).update(payload).digest("base64url");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export function isAdminConfigured(): boolean {
  return Boolean(getEnv().ADMIN_PASSWORD);
}

/** Never a fixed string comparison — a network-timing-based guess should learn nothing. */
export function checkAdminPassword(candidate: string): boolean {
  const expected = getEnv().ADMIN_PASSWORD;
  if (!expected) return false;
  return timingSafeEqualStr(candidate, expected);
}

// Path=/ , not /admin: the cookie must also reach /api/admin/* (a sibling path, not a child of
// /admin), or every /api/admin route 401s even while genuinely logged in. Caught by a live test
// where CSV export failed right after a successful login.
export function issueAdminCookie(now: Date = new Date()): string {
  const expires = now.getTime() + TTL_MS;
  const payload = `admin.${expires}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_COOKIE_NAME}=${payload}.${sign(payload)}; Path=/; Max-Age=${Math.floor(TTL_MS / 1000)}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearAdminCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

export function isAdminSession(cookieValue: string | undefined, now: Date = new Date()): boolean {
  if (!cookieValue) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return false;
  const [tag, expiresStr, sig] = parts;
  if (tag !== "admin") return false;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < now.getTime()) return false;
  return timingSafeEqualStr(sig, sign(`${tag}.${expiresStr}`));
}
