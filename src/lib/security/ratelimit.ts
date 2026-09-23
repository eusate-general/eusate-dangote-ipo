import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  /** Seconds until the current window resets. */
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter shared across serverless instances via Postgres. One row per key: a request
 * either lands in the current window (increments) or starts a new one (resets to 1), in one
 * round trip with no read-then-write race — two concurrent requests for a fresh key both get
 * counted, never lost.
 */
export async function checkRateLimit(key: string, windowMs: number, max: number, now: Date = new Date()): Promise<RateLimitResult> {
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);

  const [row] = await getDb().execute<{ count: number }>(sql`
    insert into rate_limit_buckets (key, window_start, count)
    values (${key}, ${windowStart.toISOString()}::timestamptz, 1)
    on conflict (key) do update set
      count = case
        when rate_limit_buckets.window_start = excluded.window_start then rate_limit_buckets.count + 1
        else 1
      end,
      window_start = excluded.window_start
    returning count
  `);

  const count = Number(row.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000));
  return { allowed: count <= max, count, limit: max, retryAfterSeconds };
}

/** IPv4/IPv6 from the first hop in a forwarded-for chain. Vercel's own header is trustworthy; a raw one is not. */
export function clientIp(headers: Headers): string {
  const vercelIp = headers.get("x-vercel-forwarded-for") ?? headers.get("x-real-ip");
  if (vercelIp) return vercelIp.split(",")[0].trim();
  return headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}
