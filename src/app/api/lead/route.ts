import type { NextRequest } from "next/server";
import { z } from "zod";
import { logEvent } from "@/lib/events";
import { submitLead } from "@/lib/leads";
import { checkRateLimit, clientIp } from "@/lib/security/ratelimit";
import { readVisitor, visitorCookie } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IP_LIMIT = { windowMs: 60 * 60_000, max: 10 };

const Body = z.object({
  email: z.email().max(200),
  // Explicit, required consent — never inferred from just submitting the form.
  consent: z.literal(true),
  context: z.string().max(60).default("homepage_card"),
});

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(`lead:ip:${clientIp(request.headers)}`, IP_LIMIT.windowMs, IP_LIMIT.max);
  if (!limit.allowed) return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const visitor = readVisitor(request);
  const { id } = await submitLead({ email: parsed.data.email, visitorId: visitor.id, context: parsed.data.context });
  await logEvent({ visitorId: visitor.id, type: "lead_submitted", props: { leadId: id, context: parsed.data.context } });

  const headers = new Headers({ "content-type": "application/json" });
  if (visitor.isNew) headers.append("Set-Cookie", visitorCookie(visitor.id));
  return new Response(JSON.stringify({ ok: true }), { headers });
}
