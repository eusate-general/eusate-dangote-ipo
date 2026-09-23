import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { startOfWatDay } from "@/lib/time";

const MEMO_MS = 30_000;
let memo: { at: number; day: string; value: number } | null = null;

/** Sum of today's (WAT) answer costs. Cached for 30s, so the cap can overshoot by about that much traffic. */
export async function todaySpendUsd(now: Date = new Date()): Promise<number> {
  const dayStart = startOfWatDay(now);
  const day = dayStart.toISOString();
  if (memo && memo.day === day && Date.now() - memo.at < MEMO_MS) return memo.value;

  const [row] = await getDb()
    .select({ total: sql<string>`coalesce(sum((${events.props}->>'cost_usd')::numeric), 0)` })
    .from(events)
    .where(and(eq(events.type, "answer_served"), gte(events.ts, dayStart)));

  const value = Number(row?.total ?? 0);
  memo = { at: Date.now(), day, value };
  return value;
}

export async function isOverBudget(now: Date = new Date()): Promise<{ over: boolean; spent: number; cap: number }> {
  const cap = getEnv().DAILY_BUDGET_USD;
  const spent = await todaySpendUsd(now);
  return { over: spent >= cap, spent, cap };
}
