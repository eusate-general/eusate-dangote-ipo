import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { articles, ingestRuns, type IngestSourceResult } from "@/lib/db/schema";
import { notify, type AlertInput } from "@/lib/notify";
import { costUsd } from "@/lib/pricing";
import { watDate } from "@/lib/time";
import { assignClusters } from "./cluster";
import type { Enricher } from "./enrich";
import { parseFeed, parseWpJson, type FeedItem } from "./parse";
import { isPossiblyRelevant, isPromotional } from "./relevance";
import type { ChangeSignal } from "./signals";
import { MAX_ARTICLE_AGE_DAYS, SOURCES, USER_AGENT, type NewsSource } from "./sources";
import { getChangeSignals } from "./store";
import { canonicalizeUrl } from "./text";

const FETCH_CONCURRENCY = 5;
const ENRICH_CONCURRENCY = 3;
const MAX_ATTEMPTS = 3;
const MAX_BYTES = 3_000_000;
const CLUSTER_WINDOW_HOURS = 168;

export type FetchText = (url: string) => Promise<{ status: number; text: string }>;

export interface IngestDeps {
  enricher: Enricher;
  /** Current published terms (see buildBaseline), given to the classifier. */
  baseline: string;
  sources?: NewsSource[];
  fetchText?: FetchText;
  notifyFn?: (alert: AlertInput) => Promise<unknown>;
  now?: () => Date;
}

export interface IngestSummary {
  ok: boolean;
  sourcesTotal: number;
  sourcesFailed: number;
  fetched: number;
  newItems: number;
  relevantItems: number;
  enrichedOk: number;
  enrichedFailed: number;
  enrichCostUsd: number;
  signals: ChangeSignal[];
  perSource: IngestSourceResult[];
}

type Candidate = FeedItem & { canonicalUrl: string };

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 200);

export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One request with a couple of retries for the failures that clear on their own: a dropped connection,
 * a timeout, a 429 or a 5xx. A 403 or 404 is an answer, so it is returned immediately.
 */
export async function fetchTextWithRetry(
  url: string,
  opts: { fetchFn?: typeof fetch; attempts?: number; delayMs?: number } = {},
): Promise<{ status: number; text: string }> {
  const fetchFn = opts.fetchFn ?? fetch;
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 1000;

  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetchFn(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/rss+xml, application/atom+xml, application/json, application/xml, text/xml;q=0.9, */*;q=0.5",
        },
        signal: AbortSignal.timeout(15_000),
        redirect: "follow",
      });
      const transient = res.status === 429 || res.status >= 500;
      if (transient && attempt < attempts) {
        await sleep(delayMs * attempt);
        continue;
      }
      if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("response too large");
      const text = await res.text();
      if (text.length > MAX_BYTES) throw new Error("response too large");
      return { status: res.status, text };
    } catch (err) {
      if (attempt >= attempts || (err instanceof Error && err.message === "response too large")) throw err;
      await sleep(delayMs * attempt);
    }
  }
}

export const defaultFetchText: FetchText = (url) => fetchTextWithRetry(url);

/**
 * One full pass: fetch sources, keep new relevant items, summarise them, group same-story headlines,
 * look for reports of change, and alert the owner about anything that needs a human.
 * Cost stays flat because only items not seen before are sent to the model.
 */
export async function runIngest(deps: IngestDeps): Promise<IngestSummary> {
  const db = getDb();
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const sources = deps.sources ?? SOURCES;
  const fetchText = deps.fetchText ?? defaultFetchText;
  const alert = deps.notifyFn ?? ((a: AlertInput) => notify(a));

  // 1. Fetch and parse every source; one bad source never stops the rest.
  const cutoff = startedAt.getTime() - MAX_ARTICLE_AGE_DAYS * 86_400_000;
  const candidates = new Map<string, Candidate>();
  let fetched = 0;

  const perSource = await mapLimit(sources, FETCH_CONCURRENCY, async (src): Promise<IngestSourceResult> => {
    try {
      const { status, text } = await fetchText(src.url);
      if (status >= 400) throw new Error(`HTTP ${status}`);
      const items = src.kind === "rss" ? parseFeed(text, src) : parseWpJson(text, src);
      fetched += items.length;
      let kept = 0;
      for (const item of items) {
        if (item.publishedAt.getTime() < cutoff) continue;
        if (src.prefilter && !isPossiblyRelevant(item)) continue;
        const canonicalUrl = canonicalizeUrl(item.url);
        if (!canonicalUrl || candidates.has(canonicalUrl) || isPromotional(canonicalUrl)) continue;
        candidates.set(canonicalUrl, { ...item, canonicalUrl });
        kept++;
      }
      return { id: src.id, ok: true, items: items.length, kept };
    } catch (err) {
      return { id: src.id, ok: false, error: errorMessage(err) };
    }
  });

  // 2. Store what is new; work out what still needs summarising (new, or earlier attempts that failed).
  const urls = [...candidates.keys()];
  const known = new Map(
    urls.length === 0
      ? []
      : (
          await db
            .select({ canonicalUrl: articles.canonicalUrl, status: articles.status })
            .from(articles)
            .where(inArray(articles.canonicalUrl, urls))
        ).map((r) => [r.canonicalUrl, r.status] as const),
  );
  const fresh = [...candidates.values()].filter((c) => !known.has(c.canonicalUrl));
  for (let i = 0; i < fresh.length; i += 100) {
    await db
      .insert(articles)
      .values(
        fresh.slice(i, i + 100).map((c) => ({
          sourceId: c.sourceId,
          sourceName: c.sourceName,
          url: c.url,
          canonicalUrl: c.canonicalUrl,
          title: c.title,
          publishedAt: c.publishedAt,
        })),
      )
      .onConflictDoNothing({ target: articles.canonicalUrl });
  }
  const toEnrich = [...candidates.values()].filter((c) => {
    const status = known.get(c.canonicalUrl);
    return status === undefined || status === "pending";
  });

  // 3. Summarise and classify.
  let enrichedOk = 0;
  let enrichedFailed = 0;
  let relevantItems = 0;
  let enrichCostUsd = 0;
  const failures: string[] = [];

  await mapLimit(toEnrich, ENRICH_CONCURRENCY, async (c) => {
    try {
      const { result, usage, model } = await deps.enricher.enrich({
        title: c.title,
        text: c.text,
        sourceName: c.sourceName,
        publishedAt: c.publishedAt,
        baseline: deps.baseline,
      });
      enrichCostUsd += costUsd(usage, model);
      await db
        .update(articles)
        .set({
          status: result.relevant ? "relevant" : "irrelevant",
          summary: result.relevant ? result.summary : null,
          eventTypes: result.eventTypes,
          claim: result.claim,
          enrichAttempts: sql`${articles.enrichAttempts} + 1`,
        })
        .where(eq(articles.canonicalUrl, c.canonicalUrl));
      enrichedOk++;
      if (result.relevant) relevantItems++;
    } catch (err) {
      enrichedFailed++;
      if (failures.length < 3) failures.push(errorMessage(err));
      await db
        .update(articles)
        .set({
          enrichAttempts: sql`${articles.enrichAttempts} + 1`,
          status: sql`case when ${articles.enrichAttempts} + 1 >= ${MAX_ATTEMPTS} then 'failed' else 'pending' end`,
        })
        .where(eq(articles.canonicalUrl, c.canonicalUrl));
    }
  });

  // 4. Group headlines about the same story.
  const windowStart = new Date(startedAt.getTime() - CLUSTER_WINDOW_HOURS * 3_600_000);
  const recent = await db
    .select({ id: articles.id, title: articles.title, publishedAt: articles.publishedAt, clusterId: articles.clusterId })
    .from(articles)
    .where(and(eq(articles.status, "relevant"), gte(articles.publishedAt, windowStart)));
  const assigned = assignClusters(
    recent.filter((r) => r.clusterId === null),
    recent.filter((r) => r.clusterId !== null),
  );
  for (const [id, clusterId] of assigned) {
    await db.update(articles).set({ clusterId }).where(eq(articles.id, id));
  }

  // 5. Reports of change go to the owner. They never edit facts.
  const { signals, articles: signalArticles } = await getChangeSignals(startedAt);
  const byId = new Map(signalArticles.map((a) => [a.id, a]));
  for (const s of signals) {
    const lines = s.articleIds.slice(0, 5).flatMap((id) => {
      const a = byId.get(id);
      return a ? [`- ${a.sourceName}: ${a.title}${a.url ? `\n  ${a.url}` : ""}`] : [];
    });
    const isPlatform = s.type === "PLATFORM_CHANGE";
    const what = s.type.replace(/_/g, " ").toLowerCase();
    await alert({
      key: `signal:${s.type}:${s.independent ? "multi" : "single"}:${watDate(s.latestAt)}`,
      kind: "change_signal",
      severity: s.botVisible ? "warn" : "info",
      title: isPlatform
        ? "New platforms reported"
        : `${s.independent ? "Reported" : "Single-source report of"} ${what}`,
      body:
        `${s.claims.map((c) => `- ${c}`).join("\n")}\n\nReported by ${s.sources.join(", ")}.\n\n${lines.join("\n")}\n\n` +
        (isPlatform
          ? "The bot does not mention platform news as a change. If these are real, check ipo.dangote.com and update facts/platforms.yaml."
          : s.botVisible
            ? "The bot now mentions this as a possible change. Check ipo.dangote.com and update facts/ipo.yaml if it is real."
            : "Only one outlet so far, so the bot does not mention it yet. Check ipo.dangote.com."),
      cooldownMinutes: 720,
    });
  }

  // 6. Pipeline health.
  const failedSources = perSource.filter((s) => !s.ok);
  const allFailed = failedSources.length === sources.length;
  const enrichBroken = enrichedFailed > 0 && enrichedOk === 0;
  const failedList = failedSources.map((s) => `${s.id}: ${s.error}`).join("\n");

  if (allFailed) {
    await alert({
      key: "ingest:all-sources-failed",
      kind: "ingest_failed",
      severity: "critical",
      title: "News ingest: every source failed",
      body: `No news source could be read. The news feed is going stale.\n\n${failedList}`,
    });
  } else if (failedSources.length * 2 >= sources.length) {
    await alert({
      key: "ingest:sources-degraded",
      kind: "sources_degraded",
      severity: "warn",
      title: `News ingest: ${failedSources.length} of ${sources.length} sources failing`,
      body: failedList,
    });
  }
  if (enrichBroken) {
    await alert({
      key: "ingest:enrich-failed",
      kind: "enrich_failed",
      severity: "critical",
      title: "News ingest: summarising is failing",
      body: `Every summarise call failed, so no new stories are being added. Check ANTHROPIC_API_KEY and credit.\n\n${failures.join("\n")}`,
    });
  }

  const ok = !allFailed && !enrichBroken;
  await db.insert(ingestRuns).values({
    startedAt,
    finishedAt: now(),
    ok,
    sourcesTotal: sources.length,
    sourcesFailed: failedSources.length,
    fetched,
    newItems: fresh.length,
    relevantItems,
    details: {
      perSource,
      enrichedOk,
      enrichedFailed,
      enrichCostUsd: Number(enrichCostUsd.toFixed(5)),
      failures,
      signals: signals.map((s) => ({ type: s.type, sources: s.sources, independent: s.independent })),
    },
  });

  return {
    ok,
    sourcesTotal: sources.length,
    sourcesFailed: failedSources.length,
    fetched,
    newItems: fresh.length,
    relevantItems,
    enrichedOk,
    enrichedFailed,
    enrichCostUsd,
    signals,
    perSource,
  };
}
