import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { articles, ingestRuns } from "@/lib/db/schema";
import { CHANGE_TYPES, detectSignals, type ChangeSignal, type SignalArticle } from "./signals";

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceId: string;
  publishedAt: Date;
  summary: string;
  eventTypes: string[];
}

export type NewsSearch = { kind: "web" | "or"; text: string };

type NewsRow = {
  id: string;
  title: string;
  url: string;
  source_id: string;
  source_name: string;
  published_at: string | Date;
  summary: string | null;
  event_types: string[] | null;
};

/**
 * Newest relevant stories, one per cluster (the same story from several outlets shows once).
 * `web` search takes free text; `or` search takes a pre-sanitised "a | b | c" tsquery.
 */
export async function getLatestNews(opts: {
  limit?: number;
  days?: number;
  search?: NewsSearch;
  now?: Date;
}): Promise<NewsItem[]> {
  const now = opts.now ?? new Date();
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 20);
  const since = new Date(now.getTime() - (opts.days ?? 7) * 86_400_000).toISOString();
  const search = opts.search;

  const query = search
    ? search.kind === "web"
      ? sql`websearch_to_tsquery('english', ${search.text})`
      : sql`to_tsquery('english', ${search.text})`
    : null;

  const rows = await getDb().execute<NewsRow>(sql`
    select id, title, url, source_id, source_name, published_at, summary, event_types
    from (
      select distinct on (coalesce(cluster_id, id))
        id, title, url, source_id, source_name, published_at, summary, event_types, tsv
      from articles
      where status = 'relevant' and published_at >= ${since}::timestamptz
      ${query ? sql`and tsv @@ ${query}` : sql``}
      order by coalesce(cluster_id, id), published_at desc
    ) latest
    order by ${query ? sql`ts_rank_cd(tsv, ${query}) desc,` : sql``} published_at desc
    limit ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    source: r.source_name,
    sourceId: r.source_id,
    publishedAt: new Date(r.published_at),
    summary: r.summary ?? "",
    eventTypes: r.event_types ?? [],
  }));
}

/** When the pipeline last completed a healthy run. */
export async function getIngestStatus(now: Date = new Date()): Promise<{ lastOkAt: Date | null; ageMinutes: number | null }> {
  const [row] = await getDb()
    .select({ finishedAt: ingestRuns.finishedAt })
    .from(ingestRuns)
    .where(eq(ingestRuns.ok, true))
    .orderBy(desc(ingestRuns.finishedAt))
    .limit(1);
  if (!row) return { lastOkAt: null, ageMinutes: null };
  return { lastOkAt: row.finishedAt, ageMinutes: Math.max(0, Math.round((now.getTime() - row.finishedAt.getTime()) / 60_000)) };
}

/** Minutes without a healthy run after which we call the news feed stale. */
export function staleAfterMinutes(isOpen: boolean): number {
  return isOpen ? 180 : 720;
}

export async function loadSignalArticles(now: Date, windowHours = 48): Promise<SignalArticle[]> {
  const since = new Date(now.getTime() - windowHours * 3_600_000);
  const types = sql.join(CHANGE_TYPES.map((t) => sql`${t}`), sql`, `);
  const rows = await getDb()
    .select({
      id: articles.id,
      sourceId: articles.sourceId,
      sourceName: articles.sourceName,
      title: articles.title,
      url: articles.url,
      publishedAt: articles.publishedAt,
      eventTypes: articles.eventTypes,
      claim: articles.claim,
    })
    .from(articles)
    .where(and(eq(articles.status, "relevant"), gte(articles.publishedAt, since), sql`${articles.eventTypes} && ARRAY[${types}]::text[]`));
  return rows;
}

export async function getChangeSignals(now: Date = new Date()): Promise<{ signals: ChangeSignal[]; articles: SignalArticle[] }> {
  const rows = await loadSignalArticles(now);
  return { signals: detectSignals(rows, now), articles: rows };
}
