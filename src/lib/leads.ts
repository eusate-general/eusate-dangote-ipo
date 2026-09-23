import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";

export interface SubmitLeadInput {
  email: string;
  visitorId: string;
  context: string;
}

/**
 * Stores the lead first (so it is never lost even if the webhook is down or unset), then
 * forwards it to Eusate's webhook if configured. Never throws — a broken webhook must not
 * break the person's chat experience.
 */
export async function submitLead(input: SubmitLeadInput): Promise<{ id: string; forwarded: boolean }> {
  const db = getDb();
  const [row] = await db
    .insert(leads)
    .values({ email: input.email, visitorId: input.visitorId, context: input.context })
    .returning({ id: leads.id });

  const webhookUrl = getEnv().LEAD_WEBHOOK_URL;
  if (!webhookUrl) return { id: row.id, forwarded: false };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: input.email, context: input.context, source: "dangote-ipo-guide", createdAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      await db.update(leads).set({ webhookSentAt: new Date() }).where(eq(leads.id, row.id));
      return { id: row.id, forwarded: true };
    }
    await db.update(leads).set({ webhookError: `HTTP ${res.status}` }).where(eq(leads.id, row.id));
  } catch (err) {
    await db.update(leads).set({ webhookError: err instanceof Error ? err.message.slice(0, 200) : String(err) }).where(eq(leads.id, row.id));
  }
  return { id: row.id, forwarded: false };
}
