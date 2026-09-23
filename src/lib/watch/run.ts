import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sourceChecks } from "@/lib/db/schema";
import { notify, type AlertInput } from "@/lib/notify";
import { evaluateCheck } from "./diff";
import { WATCHED_PAGES, type WatchedPage } from "./pages";

export type RenderPage = (url: string) => Promise<string>;

export interface WatchDeps {
  render: RenderPage;
  pages?: WatchedPage[];
  notifyFn?: (alert: AlertInput) => Promise<unknown>;
  now?: () => Date;
}

export interface PageResult {
  id: string;
  url: string;
  ok: boolean;
  changed: boolean;
  isFirstCheck: boolean;
  error?: string;
}

export interface WatchSummary {
  ok: boolean;
  results: PageResult[];
  changedCount: number;
}

/**
 * Renders each watched page, hashes its text, and alerts the owner when a hash changes from what
 * was last seen. Never writes to facts/ — that stays a human decision (PLAN.md section 5). A page
 * that fails to render is reported, not silently skipped, since a broken watcher is as bad as a
 * stale one.
 */
export async function runWatch(deps: WatchDeps): Promise<WatchSummary> {
  const db = getDb();
  const now = deps.now ?? (() => new Date());
  const pages = deps.pages ?? WATCHED_PAGES;
  const alert = deps.notifyFn ?? ((a: AlertInput) => notify(a));

  const results: PageResult[] = [];

  for (const page of pages) {
    try {
      const text = await deps.render(page.url);
      const [row] = await db.select().from(sourceChecks).where(eq(sourceChecks.url, page.url)).limit(1);
      const outcome = evaluateCheck(text, row?.contentHash ?? null);

      await db
        .insert(sourceChecks)
        .values({ url: page.url, contentHash: outcome.hash, lastCheckedAt: now(), lastChangedAt: outcome.changed ? now() : null })
        .onConflictDoUpdate({
          target: sourceChecks.url,
          set: {
            contentHash: outcome.hash,
            lastCheckedAt: now(),
            ...(outcome.changed ? { lastChangedAt: now() } : {}),
          },
        });

      if (outcome.changed) {
        await alert({
          key: `source_change:${page.id}:${now().toISOString().slice(0, 10)}`,
          kind: "primary_source_change",
          severity: "warn",
          title: `Official site changed: ${page.label}`,
          body:
            `${page.url} rendered different content from the last check. This may mean the offer terms, ` +
            `dates or approved-channel list changed.\n\nOpen the page and compare it against facts/ipo.yaml ` +
            `and facts/platforms.yaml, then update whichever changed. The bot's facts are not touched ` +
            `automatically — nothing changes for users until you do.`,
          cooldownMinutes: 360,
        });
      }

      results.push({ id: page.id, url: page.url, ok: true, changed: outcome.changed, isFirstCheck: outcome.isFirstCheck });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ id: page.id, url: page.url, ok: false, changed: false, isFirstCheck: false, error: message });
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length === results.length && results.length > 0) {
    await alert({
      key: "source_watch:all-failed",
      kind: "watch_failed",
      severity: "warn",
      title: "Primary-source watcher: every page failed to render",
      body: failed.map((f) => `${f.url}: ${f.error}`).join("\n"),
      cooldownMinutes: 720,
    });
  }

  return { ok: failed.length < results.length, results, changedCount: results.filter((r) => r.changed).length };
}
