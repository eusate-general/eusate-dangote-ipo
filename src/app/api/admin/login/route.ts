import type { NextRequest } from "next/server";
import { z } from "zod";
import { checkAdminPassword, isAdminConfigured, issueAdminCookie } from "@/lib/security/admin";
import { checkRateLimit, clientIp } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Slow enough to make brute-forcing the password impractical, generous enough for a fat-fingered retry.
const IP_LIMIT = { windowMs: 10 * 60_000, max: 8 };

const Body = z.object({ password: z.string().min(1).max(200) });

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(`admin-login:ip:${clientIp(request.headers)}`, IP_LIMIT.windowMs, IP_LIMIT.max);
  if (!limit.allowed) return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  if (!isAdminConfigured()) return Response.json({ error: "not_configured" }, { status: 503 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !checkAdminPassword(parsed.data.password)) {
    return Response.json({ error: "invalid_password" }, { status: 401 });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "Set-Cookie": issueAdminCookie() } });
}
