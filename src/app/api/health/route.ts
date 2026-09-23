import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getKnowledge } from "@/lib/knowledge";
import { getIngestStatus, staleAfterMinutes } from "@/lib/news/store";
import { computePhase } from "@/lib/phase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Point an uptime monitor at this. It returns 503 when the database is down or the news pipeline has stopped,
 * which is how you find out if the scheduled job dies silently.
 */
export async function GET() {
  const now = new Date();
  const knowledge = getKnowledge();
  const phase = computePhase(knowledge.ipo, now).phase;

  let db = false;
  let lastOkAt: Date | null = null;
  let ageMinutes: number | null = null;
  try {
    await getDb().execute(sql`select 1`);
    db = true;
    ({ lastOkAt, ageMinutes } = await getIngestStatus(now));
  } catch {
    // reported below through db / ingest flags
  }

  const limit = staleAfterMinutes(phase === "OPEN");
  const newsFresh = db && lastOkAt !== null && (ageMinutes ?? Infinity) <= limit;

  return Response.json(
    {
      ok: db && newsFresh,
      db,
      phase,
      news: { fresh: newsFresh, lastOkAt: lastOkAt?.toISOString() ?? null, ageMinutes, staleAfterMinutes: limit },
      knowledgeBuiltAt: knowledge.builtAt,
    },
    { status: db && newsFresh ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
