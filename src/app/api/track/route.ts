import type { NextRequest } from "next/server";
import { z } from "zod";
import { logEvent, requestContext, type EventType } from "@/lib/events";
import { checkRateLimit, clientIp } from "@/lib/security/ratelimit";
import { readVisitor, visitorCookie } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generous: this only logs a click or a page view, never runs the model. Just enough to stop log spam.
const IP_LIMIT = { windowMs: 60_000, max: 60 };

// Only client-originated events. Server events (messages, answers, errors) are logged server-side.
const CLIENT_EVENTS = [
  "page_view",
  "chat_open",
  "platform_click",
  "share_click",
  "eusate_cta_click",
  "news_click",
  "pwa_install_prompt",
  "feedback",
] as const satisfies readonly EventType[];

const Body = z.object({
  type: z.enum(CLIENT_EVENTS),
  props: z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
});

export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? 0) > 2_048) return new Response(null, { status: 413 });

  const limit = await checkRateLimit(`track:ip:${clientIp(request.headers)}`, IP_LIMIT.windowMs, IP_LIMIT.max);
  if (!limit.allowed) return new Response(null, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data.props ?? {}).length > 10) {
    return new Response(null, { status: 400 });
  }

  const visitor = readVisitor(request);
  await logEvent({
    visitorId: visitor.id,
    type: parsed.data.type,
    props: { ...parsed.data.props, ...requestContext(request), new_visitor: visitor.isNew },
  });

  const headers = new Headers();
  if (visitor.isNew) headers.append("Set-Cookie", visitorCookie(visitor.id));
  return new Response(null, { status: 204, headers });
}
