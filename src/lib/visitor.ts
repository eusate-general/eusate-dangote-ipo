import type { NextRequest } from "next/server";

const COOKIE = "vid";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Anonymous, random, first-party visitor id. No personal data. */
export function readVisitor(request: NextRequest): { id: string; isNew: boolean } {
  const existing = request.cookies.get(COOKIE)?.value;
  if (existing && UUID.test(existing)) return { id: existing, isNew: false };
  return { id: crypto.randomUUID(), isNew: true };
}

export function visitorCookie(id: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`;
}
