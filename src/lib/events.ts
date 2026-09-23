import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { events } from "@/lib/db/schema";

export type EventType =
  | "page_view"
  | "chat_open"
  | "message_sent"
  | "answer_served"
  | "answer_aborted"
  | "feedback"
  | "platform_click"
  | "share_click"
  | "eusate_cta_click"
  | "news_click"
  | "pwa_install_prompt"
  | "lead_submitted"
  | "error"
  | "rate_limited"
  | "budget_tripped";

export interface LogEventInput {
  visitorId: string;
  sessionId?: string | null;
  type: EventType;
  props?: Record<string, unknown>;
}

/** Analytics must never break a request, so failures are logged and swallowed. */
export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    await getDb()
      .insert(events)
      .values({
        visitorId: input.visitorId,
        sessionId: input.sessionId ?? null,
        type: input.type,
        props: input.props ?? {},
      });
  } catch (err) {
    console.error("logEvent failed", input.type, err instanceof Error ? err.message : err);
  }
}

/** Coarse, non-identifying request context: country/region (Vercel headers) and device class. */
export function requestContext(request: NextRequest): Record<string, string> {
  const ctx: Record<string, string> = {};
  const country = request.headers.get("x-vercel-ip-country");
  const region = request.headers.get("x-vercel-ip-country-region");
  if (country) ctx.country = country;
  if (region) ctx.region = region;
  const ua = request.headers.get("user-agent") ?? "";
  ctx.device = /mobile|android|iphone|ipad/i.test(ua) ? "mobile" : "desktop";
  return ctx;
}
