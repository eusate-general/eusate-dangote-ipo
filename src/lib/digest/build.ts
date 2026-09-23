import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getIngestStatus } from "@/lib/news/store";
import { startOfWatDay, watDate } from "@/lib/time";

export interface DigestMetrics {
  dayLabel: string;
  uniqueVisitors: number;
  uniqueChatters: number;
  conversations: number;
  messages: number;
  spendUsd: number;
  feedbackUp: number;
  feedbackDown: number;
  unbackedClaims: number;
  unknownCitations: number;
  budgetTripped: number;
  rateLimited: number;
  errors: number;
  newsIngestOk: boolean | null;
  newsAgeMinutes: number | null;
}

async function countDistinct(column: string, where: ReturnType<typeof sql>): Promise<number> {
  const [row] = await getDb().execute<{ n: string }>(sql`select count(distinct ${sql.raw(column)}) as n from events where ${where}`);
  return Number(row.n);
}

async function sumProp(type: string, prop: string, since: Date, until: Date): Promise<number> {
  const [row] = await getDb().execute<{ n: string | null }>(sql`
    select sum((props->>${prop})::numeric) as n from events
    where type = ${type} and ts >= ${since.toISOString()}::timestamptz and ts < ${until.toISOString()}::timestamptz
  `);
  return Number(row.n ?? 0);
}

async function countWhere(type: string, since: Date, until: Date, extra?: ReturnType<typeof sql>): Promise<number> {
  const [row] = await getDb().execute<{ n: string }>(sql`
    select count(*) as n from events
    where type = ${type} and ts >= ${since.toISOString()}::timestamptz and ts < ${until.toISOString()}::timestamptz
    ${extra ? sql`and ${extra}` : sql``}
  `);
  return Number(row.n);
}

async function metricsForWindow(since: Date, until: Date, now: Date): Promise<DigestMetrics> {
  const windowClause = sql`ts >= ${since.toISOString()}::timestamptz and ts < ${until.toISOString()}::timestamptz`;

  const [
    uniqueVisitors,
    uniqueChatters,
    conversations,
    messages,
    spend,
    feedbackUp,
    feedbackDown,
    unbackedClaims,
    unknownCitations,
    budgetTripped,
    rateLimited,
    errors,
    ingest,
  ] = await Promise.all([
    countDistinct("visitor_id", windowClause),
    countDistinct("visitor_id", sql`type = 'message_sent' and ${windowClause}`),
    countDistinct("session_id", sql`type = 'message_sent' and ${windowClause}`),
    countWhere("message_sent", since, until),
    sumProp("answer_served", "cost_usd", since, until),
    countWhere("feedback", since, until, sql`props->>'value' = 'up'`),
    countWhere("feedback", since, until, sql`props->>'value' = 'down'`),
    countWhere("answer_served", since, until, sql`(props->>'unbacked_numeric_claim')::boolean = true`),
    countWhere("answer_served", since, until, sql`(props->>'unknown_citations')::int > 0`),
    countWhere("budget_tripped", since, until),
    countWhere("rate_limited", since, until),
    countWhere("error", since, until),
    getIngestStatus(now),
  ]);

  return {
    // watDate, not since.toISOString(): `since` is the WAT-midnight instant, which in UTC still
    // reads as the previous calendar date - slicing it would label the report off by one day.
    dayLabel: watDate(since),
    uniqueVisitors,
    uniqueChatters,
    conversations,
    messages,
    spendUsd: spend,
    feedbackUp,
    feedbackDown,
    unbackedClaims,
    unknownCitations,
    budgetTripped,
    rateLimited,
    errors,
    newsIngestOk: ingest.lastOkAt !== null,
    newsAgeMinutes: ingest.ageMinutes,
  };
}

/** Yesterday's numbers (a full WAT day), so the digest always reports on a complete, settled day. */
export async function buildDigestMetrics(now: Date): Promise<DigestMetrics> {
  const todayStart = startOfWatDay(now);
  const since = new Date(todayStart.getTime() - 86_400_000);
  return metricsForWindow(since, todayStart, now);
}

/** Today so far (WAT), for a live dashboard — partial and will not match the eventual daily digest. */
export async function buildTodayMetrics(now: Date): Promise<DigestMetrics> {
  const todayStart = startOfWatDay(now);
  const m = await metricsForWindow(todayStart, now, now);
  return { ...m, dayLabel: watDate(now) };
}

export function formatDigest(m: DigestMetrics): { title: string; body: string } {
  const lines = [
    `Visitors: ${m.uniqueVisitors} unique. Chatters: ${m.uniqueChatters}.`,
    `Conversations: ${m.conversations}. Messages: ${m.messages}.`,
    `Spend: $${m.spendUsd.toFixed(2)}.`,
    `Feedback: ${m.feedbackUp} up / ${m.feedbackDown} down.`,
    `Review queue: ${m.unbackedClaims} unbacked-claim answer(s), ${m.unknownCitations} with an unresolved citation marker.`,
    `News feed: ${m.newsIngestOk ? `healthy, last updated ${m.newsAgeMinutes} min ago` : "no successful run found"}.`,
    m.budgetTripped > 0 ? `Budget cap was hit ${m.budgetTripped} time(s).` : null,
    m.rateLimited > 0 ? `Rate limit triggered ${m.rateLimited} time(s).` : null,
    m.errors > 0 ? `${m.errors} server error(s) logged.` : null,
  ].filter((l): l is string => l !== null);

  return { title: `Daily digest, ${m.dayLabel}`, body: lines.join("\n") };
}
