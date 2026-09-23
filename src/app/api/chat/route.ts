import type { NextRequest } from "next/server";
import { z } from "zod";
import { MAX_MESSAGE_CHARS, runTurn } from "@/lib/chat/service";
import { checkRateLimit, clientIp } from "@/lib/security/ratelimit";
import { issueVerifiedCookie, isVerified, VERIFIED_COOKIE_NAME } from "@/lib/security/session";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { encodeSse } from "@/lib/sse";
import { readVisitor, visitorCookie } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 4_096;

// Defaults for a launch-scale audience; retune from real traffic once it exists (see PLAN.md M2).
const IP_LIMIT = { windowMs: 5 * 60_000, max: 20 }; // catches a flood regardless of who it claims to be
const VISITOR_LIMIT = { windowMs: 60 * 60_000, max: 40 }; // a real person rarely sends 40 messages/hour

const Body = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  conversationId: z.uuid().nullish(),
  turnstileToken: z.string().max(2048).optional(),
});

function jsonError(status: number, error: string, retryAfterSeconds?: number) {
  const headers = new Headers({ "content-type": "application/json" });
  if (retryAfterSeconds) headers.set("Retry-After", String(retryAfterSeconds));
  return new Response(JSON.stringify({ error }), { status, headers });
}

export async function POST(request: NextRequest) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return jsonError(413, "too_large");

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid_request");

  const now = new Date();
  const ip = clientIp(request.headers);

  // 1. IP throttle first: cheapest check, and keeps a flood from ever reaching Turnstile or the LLM.
  const ipLimit = await checkRateLimit(`chat:ip:${ip}`, IP_LIMIT.windowMs, IP_LIMIT.max, now);
  if (!ipLimit.allowed) return jsonError(429, "rate_limited", ipLimit.retryAfterSeconds);

  const visitor = readVisitor(request);
  const extraCookies: string[] = [];
  if (visitor.isNew) extraCookies.push(visitorCookie(visitor.id));

  // 2. Bot check, only once per visitor per day (see issueVerifiedCookie) — not on every message.
  const alreadyVerified = isVerified(request.cookies.get(VERIFIED_COOKIE_NAME)?.value, visitor.id, now);
  if (!alreadyVerified) {
    const check = await verifyTurnstile(parsed.data.turnstileToken, ip);
    if (!check.ok) return jsonError(403, "bot_check_failed");
    extraCookies.push(issueVerifiedCookie(visitor.id, now));
  }

  // 3. Per-visitor throttle: now that we trust this is one real, checked visitor.
  const visitorLimit = await checkRateLimit(`chat:visitor:${visitor.id}`, VISITOR_LIMIT.windowMs, VISITOR_LIMIT.max, now);
  if (!visitorLimit.allowed) return jsonError(429, "rate_limited", visitorLimit.retryAfterSeconds);

  const turn = runTurn({
    visitorId: visitor.id,
    conversationId: parsed.data.conversationId ?? null,
    message: parsed.data.message,
    now,
    signal: request.signal,
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await turn.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(encodeSse(value)));
    },
    async cancel() {
      // Browser went away: let the turn's cleanup (persisting the partial answer) run.
      await turn.return(undefined);
    },
  });

  const headers = new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    "X-Accel-Buffering": "no",
  });
  for (const cookie of extraCookies) headers.append("Set-Cookie", cookie);
  return new Response(body, { headers });
}
