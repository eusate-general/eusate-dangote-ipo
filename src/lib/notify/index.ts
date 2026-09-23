import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { alerts } from "@/lib/db/schema";
import { sendEmail } from "./email";
import { sendTelegram } from "./telegram";

export type Severity = "info" | "warn" | "critical";

export interface AlertInput {
  /** Same key means same problem: it is not re-sent until the cooldown passes. */
  key: string;
  kind: string;
  severity: Severity;
  title: string;
  body: string;
  cooldownMinutes?: number;
}

export type NotifyResult = "sent" | "logged" | "cooldown";

/** Just the variables the senders read. `process.env` fits, and so does a plain object in tests. */
export type EnvMap = Record<string, string | undefined>;

export interface NotifyDeps {
  env?: EnvMap;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

const DEFAULT_COOLDOWN_MINUTES: Record<Severity, number> = { critical: 60, warn: 360, info: 720 };

/**
 * Owner alerts. Email carries everything; Telegram (a phone push) carries warn and critical only.
 * With no channel configured the alert is logged and recorded, never lost silently.
 */
export async function notify(input: AlertInput, deps: NotifyDeps = {}): Promise<NotifyResult> {
  const env = deps.env ?? process.env;
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now?.() ?? new Date();
  const db = getDb();

  const [existing] = await db.select().from(alerts).where(eq(alerts.key, input.key)).limit(1);
  const cooldownMs = (input.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES[input.severity]) * 60_000;
  if (existing && now.getTime() - existing.lastSentAt.getTime() < cooldownMs) return "cooldown";

  await db
    .insert(alerts)
    .values({ key: input.key, kind: input.kind, severity: input.severity, title: input.title, body: input.body, lastSentAt: now })
    .onConflictDoUpdate({
      target: alerts.key,
      set: { severity: input.severity, title: input.title, body: input.body, lastSentAt: now, count: sql`${alerts.count} + 1` },
    });

  const sends: Promise<boolean>[] = [];
  if (input.severity !== "info") sends.push(sendTelegram(env, fetchFn, input));
  sends.push(sendEmail(env, fetchFn, input));
  const delivered = (await Promise.all(sends)).some(Boolean);

  if (!delivered) console.warn(`[alert:${input.severity}] ${input.title}\n${input.body}`);
  return delivered ? "sent" : "logged";
}
