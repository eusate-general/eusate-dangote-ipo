import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Enricher } from "@/lib/news/enrich";
import type { NewsSource } from "@/lib/news/sources";
import type { AlertInput } from "@/lib/notify";

// Runs only against a throwaway database:
//   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5544/dangote_ipo_test npm test
const TEST_DB = process.env.TEST_DATABASE_URL;

const NOW = new Date("2026-09-19T12:00:00Z");
const USAGE = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

const rssFeed = (items: { title: string; link: string; date: string }[]) =>
  `<rss version="2.0"><channel>${items
    .map((i) => `<item><title>${i.title}</title><link>${i.link}</link><pubDate>${i.date}</pubDate><description>excerpt</description></item>`)
    .join("")}</channel></rss>`;

const wpFeed = (posts: { title: string; link: string; date: string }[]) =>
  JSON.stringify(posts.map((p) => ({ date_gmt: p.date, link: p.link, title: { rendered: p.title }, excerpt: { rendered: "<p>excerpt</p>" } })));

const FEEDS: Record<string, { status: number; text: string }> = {
  "https://rss.test/feed": {
    status: 200,
    text: rssFeed([
      { title: "Dangote refinery IPO: 10 steps to buy shares for N5,250", link: "https://rss.test/a?utm_source=x", date: "Sat, 19 Sep 2026 08:00:00 +0000" },
      { title: "Weather in Lagos this weekend", link: "https://rss.test/weather", date: "Sat, 19 Sep 2026 08:10:00 +0000" },
      { title: "SEC extends Dangote refinery IPO deadline to October 20", link: "https://rss.test/t1", date: "Sat, 19 Sep 2026 09:00:00 +0000" },
      { title: "Sponsored: subscribe to the Dangote IPO with our bank", link: "https://rss.test/promoted/99-dangote-ipo-bank", date: "Sat, 19 Sep 2026 09:05:00 +0000" },
    ]),
  },
  "https://wp.test/api": {
    status: 200,
    text: wpFeed([
      { title: "Dangote refinery IPO: steps to buy shares for N5,250", link: "https://wp.test/a2", date: "2026-09-19T09:30:00" },
      { title: "Dangote IPO closing date extended to October 20 by SEC", link: "https://wp.test/t2", date: "2026-09-19T10:00:00" },
      { title: "Dangote Cement shares rally", link: "https://wp.test/n", date: "2026-09-19T10:30:00" },
    ]),
  },
  "https://broken.test/feed": { status: 403, text: "Forbidden" },
};

const SOURCES: NewsSource[] = [
  { id: "test-rss", name: "Test RSS", kind: "rss", url: "https://rss.test/feed", prefilter: true },
  { id: "test-wp", name: "Test WP", kind: "wp-json", url: "https://wp.test/api", prefilter: false },
  { id: "test-broken", name: "Test Broken", kind: "rss", url: "https://broken.test/feed", prefilter: true },
];

const fetchText = async (url: string) => FEEDS[url] ?? { status: 404, text: "" };

describe.skipIf(!TEST_DB)("news pipeline against a database", () => {
  let ingest: typeof import("@/lib/news/ingest");
  let store: typeof import("@/lib/news/store");
  let context: typeof import("@/lib/news/context");
  let notifyModule: typeof import("@/lib/notify");
  let schema: typeof import("@/lib/db/schema");
  let db: ReturnType<typeof import("@/lib/db/client").getDb>;

  const seen: string[] = [];
  const alertsSent: AlertInput[] = [];
  const enricher: Enricher = {
    async enrich(input) {
      seen.push(input.title);
      const t = input.title.toLowerCase();
      const relevant = t.includes("ipo");
      const change = /extend/.test(t);
      return {
        result: {
          relevant,
          summary: relevant ? `Summary of ${input.title}` : "",
          eventTypes: relevant ? (change ? ["TIMELINE_CHANGE"] : ["OTHER"]) : [],
          claim: change ? "Deadline moved to 20 October" : null,
        },
        usage: USAGE,
        model: "claude-haiku-4-5",
      };
    },
  };
  const failing: Enricher = {
    async enrich() {
      throw new Error("credit balance too low");
    },
  };
  const run = (e: Enricher = enricher, sources: NewsSource[] = SOURCES, now = NOW, fetcher = fetchText) =>
    ingest.runIngest({
      enricher: e,
      baseline: "Offer price ₦525 per share. Opens 14 Sep 2026; closes 13 Oct 2026.",
      sources,
      fetchText: fetcher,
      notifyFn: async (a) => void alertsSent.push(a),
      now: () => now,
    });

  beforeAll(async () => {
    if (!/test/i.test(TEST_DB ?? "")) throw new Error("TEST_DATABASE_URL must point at a database with 'test' in its name");
    process.env.DATABASE_URL = TEST_DB;
    ingest = await import("@/lib/news/ingest");
    store = await import("@/lib/news/store");
    context = await import("@/lib/news/context");
    notifyModule = await import("@/lib/notify");
    schema = await import("@/lib/db/schema");
    db = (await import("@/lib/db/client")).getDb();
  });

  beforeEach(async () => {
    seen.length = 0;
    alertsSent.length = 0;
    await db.delete(schema.articles);
    await db.delete(schema.ingestRuns);
    await db.delete(schema.alerts);
  });

  afterAll(async () => {
    await db?.delete(schema.articles);
    await db?.delete(schema.ingestRuns);
    await db?.delete(schema.alerts);
  });

  const rows = () => db.select().from(schema.articles);

  it("ingests a mixed set of sources and survives one broken source", async () => {
    const summary = await run();

    expect(summary.sourcesFailed).toBe(1);
    expect(summary.perSource.find((s) => s.id === "test-broken")?.error).toBe("HTTP 403");
    expect(summary.ok).toBe(true);
    expect(summary.newItems).toBe(5); // the weather story fails the pre-filter; the sponsored post is skipped
    expect(seen).toHaveLength(5);
    expect((await rows()).some((r) => r.url.includes("/promoted/"))).toBe(false);
    expect(summary.relevantItems).toBe(4); // Dangote Cement is judged irrelevant by the summariser
    expect(summary.enrichCostUsd).toBeGreaterThan(0);

    const all = await rows();
    expect(all.filter((r) => r.status === "relevant")).toHaveLength(4);
    expect(all.filter((r) => r.status === "irrelevant")).toHaveLength(1);
    expect(all.find((r) => r.canonicalUrl === "https://rss.test/a")?.title).toContain("10 steps");
    expect(all.find((r) => r.title.includes("Cement"))?.summary).toBeNull();
    expect(alertsSent.filter((a) => a.severity === "critical")).toHaveLength(0);

    const [runRow] = await db.select().from(schema.ingestRuns);
    expect(runRow.ok).toBe(true);
    expect(runRow.sourcesFailed).toBe(1);
  });

  it("groups the same story from two outlets under one cluster", async () => {
    await run();
    const a = (await rows()).filter((r) => r.title.includes("steps to buy"));
    expect(a).toHaveLength(2);
    expect(a[0].clusterId).not.toBeNull();
    expect(a[0].clusterId).toBe(a[1].clusterId);
  });

  it("alerts the owner when two outlets report a timeline change, and tells the bot", async () => {
    const summary = await run();

    expect(summary.signals).toHaveLength(1);
    expect(summary.signals[0]).toMatchObject({ type: "TIMELINE_CHANGE", independent: true, botVisible: true });
    const alert = alertsSent.find((a) => a.kind === "change_signal");
    expect(alert?.severity).toBe("warn");
    expect(alert?.key).toContain("multi");
    expect(alert?.body).toContain("Deadline moved to 20 October");
    expect(alert?.body).toContain("Test RSS");

    const ctx = await context.buildNewsContext("has the deadline been extended?", NOW, true);
    expect(ctx?.changeSignals).toHaveLength(1);
    expect(ctx?.changeSignals[0]).toContain("Change to the offer timeline reported");
  });

  it("tells only the owner about platform news, never the bot", async () => {
    const platformFeeds: Record<string, { status: number; text: string }> = {
      "https://rss.test/feed": {
        status: 200,
        text: rssFeed([{ title: "UBA opens Dangote IPO subscription channel", link: "https://rss.test/uba", date: "Sat, 19 Sep 2026 09:00:00 +0000" }]),
      },
      "https://wp.test/api": {
        status: 200,
        text: wpFeed([{ title: "Moniepoint added to Dangote IPO platforms", link: "https://wp.test/moniepoint", date: "2026-09-19T10:00:00" }]),
      },
    };
    const platformEnricher: Enricher = {
      async enrich(input) {
        return {
          result: { relevant: true, summary: input.title, eventTypes: ["PLATFORM_CHANGE"], claim: `${input.title}: added as a channel` },
          usage: USAGE,
          model: "claude-haiku-4-5",
        };
      },
    };

    const summary = await run(platformEnricher, [SOURCES[0], SOURCES[1]], NOW, async (url) => platformFeeds[url] ?? { status: 404, text: "" });

    expect(summary.signals[0]).toMatchObject({ type: "PLATFORM_CHANGE", independent: true, botVisible: false });
    const alert = alertsSent.find((a) => a.kind === "change_signal");
    expect(alert?.severity).toBe("info");
    expect(alert?.title).toBe("New platforms reported");
    expect(alert?.body).toContain("facts/platforms.yaml");

    const ctx = await context.buildNewsContext("which platforms can I use?", NOW, true);
    expect(ctx?.changeSignals).toEqual([]);
    expect(ctx?.text).toContain("UBA opens");
  });

  it("does not summarise or re-store anything it has already seen", async () => {
    await run();
    const before = seen.length;
    const second = await run();

    expect(second.newItems).toBe(0);
    expect(seen).toHaveLength(before);
    expect(await rows()).toHaveLength(5);
    expect(await db.select().from(schema.ingestRuns)).toHaveLength(2);
  });

  it("retries failed summaries, alerts loudly, and gives up after three attempts", async () => {
    const one: NewsSource[] = [SOURCES[1]];

    const first = await run(failing, one);
    expect(first.ok).toBe(false);
    expect(alertsSent.some((a) => a.key === "ingest:enrich-failed" && a.severity === "critical")).toBe(true);
    const pending = await rows();
    expect(pending.every((r) => r.status === "pending" && r.enrichAttempts === 1)).toBe(true);

    const second = await run(enricher, one); // credit topped up: the same items are picked up again
    expect(second.enrichedOk).toBeGreaterThan(0);
    expect((await rows()).every((r) => r.status !== "pending")).toBe(true);

    await db.delete(schema.articles);
    await run(failing, one);
    await run(failing, one);
    await run(failing, one);
    expect((await rows()).every((r) => r.status === "failed" && r.enrichAttempts === 3)).toBe(true);
    seen.length = 0;
    await run(enricher, one);
    expect(seen).toHaveLength(0); // permanently failed items are not retried forever
  });

  it("alerts critically when every source fails", async () => {
    const dead: NewsSource[] = [SOURCES[2]];
    const summary = await run(enricher, dead);
    expect(summary.ok).toBe(false);
    expect(alertsSent.map((a) => a.key)).toContain("ingest:all-sources-failed");
  });

  it("serves one story per cluster, newest first, with search and freshness", async () => {
    await run();

    const latest = await store.getLatestNews({ limit: 10, days: 30, now: NOW });
    expect(latest).toHaveLength(3); // the two "steps to buy" reports collapse into one
    expect(latest.map((i) => i.publishedAt.getTime())).toEqual([...latest.map((i) => i.publishedAt.getTime())].sort((a, b) => b - a));
    expect(latest[0].title).toContain("closing date extended");

    const hits = await store.getLatestNews({ limit: 5, days: 30, now: NOW, search: { kind: "or", text: "extended" } });
    // Stemming: "extended" also finds "extends". The unrelated "steps to buy" story stays out.
    expect(new Set(hits.map((h) => h.title))).toEqual(
      new Set(["Dangote IPO closing date extended to October 20 by SEC", "SEC extends Dangote refinery IPO deadline to October 20"]),
    );
    expect(await store.getLatestNews({ days: 30, now: NOW, search: { kind: "web", text: "weather" } })).toEqual([]);

    const status = await store.getIngestStatus(new Date("2026-09-19T12:10:00Z"));
    expect(status.ageMinutes).toBe(10);
    expect(store.staleAfterMinutes(true)).toBe(180);
  });

  it("builds bot context with citations, and reports a stale or missing feed honestly", async () => {
    await run();

    const fresh = await context.buildNewsContext("how do I buy shares?", NOW, true);
    expect(fresh?.note).toBeNull();
    expect(fresh?.text).toContain("[[news:");
    expect(fresh?.entries).toHaveLength(3);
    expect(fresh?.entries[0]).toMatchObject({ kind: "news" });

    const stale = await context.buildNewsContext("anything new?", new Date("2026-09-19T17:00:00Z"), true);
    expect(stale?.note).toContain("last updated 5 hours ago");

    await db.delete(schema.ingestRuns);
    const never = await context.buildNewsContext("anything new?", NOW, true);
    expect(never?.note).toContain("has not run yet");
  });

  it("finds nothing for a status query when the table is empty", async () => {
    const empty = await context.buildNewsContext("anything new?", NOW, true);
    expect(empty?.text).toBeNull();
    expect(empty?.note).toContain("Do not claim to have the latest news");
    expect(await db.select().from(schema.articles).where(and(eq(schema.articles.status, "relevant")))).toHaveLength(0);
  });

  describe("owner alerts", () => {
    const env = {
      TELEGRAM_BOT_TOKEN: "tok",
      TELEGRAM_CHAT_ID: "42",
      RESEND_API_KEY: "re_key",
      ALERT_EMAIL_FROM: "guide@eusate.com",
      ALERT_EMAIL_TO: "a@example.com, b@example.com",
    };

    function recorder() {
      const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
      const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
          auth: new Headers(init?.headers).get("authorization"),
        });
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch;
      return { calls, fetchFn };
    }

    it("sends warn alerts to Telegram and email, and respects the cooldown", async () => {
      const { calls, fetchFn } = recorder();
      const alert = { key: "k1", kind: "test", severity: "warn" as const, title: "Feed stale", body: "No run for 4 hours" };

      expect(await notifyModule.notify(alert, { env, fetchFn, now: () => NOW })).toBe("sent");
      expect(calls).toHaveLength(2);
      const telegram = calls.find((c) => c.url.includes("api.telegram.org"));
      expect(telegram?.url).toBe("https://api.telegram.org/bottok/sendMessage");
      expect(telegram?.body.chat_id).toBe("42");
      expect(String(telegram?.body.text)).toContain("[WARN] Feed stale");
      const email = calls.find((c) => c.url.includes("resend.com"));
      expect(email?.auth).toBe("Bearer re_key");
      expect(email?.body.to).toEqual(["a@example.com", "b@example.com"]);
      expect(String(email?.body.subject)).toContain("Feed stale");

      expect(await notifyModule.notify(alert, { env, fetchFn, now: () => new Date(NOW.getTime() + 60_000) })).toBe("cooldown");
      expect(calls).toHaveLength(2);

      const later = new Date(NOW.getTime() + 7 * 3_600_000);
      expect(await notifyModule.notify(alert, { env, fetchFn, now: () => later })).toBe("sent");
      const [row] = await db.select().from(schema.alerts).where(eq(schema.alerts.key, "k1"));
      expect(row.count).toBe(2);
    });

    it("keeps info alerts off Telegram", async () => {
      const { calls, fetchFn } = recorder();
      await notifyModule.notify({ key: "k2", kind: "test", severity: "info", title: "FYI", body: "b" }, { env, fetchFn, now: () => NOW });
      expect(calls.map((c) => new URL(c.url).hostname)).toEqual(["api.resend.com"]);
    });

    it("records and logs the alert when no channel is configured", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const { calls, fetchFn } = recorder();
      const result = await notifyModule.notify(
        { key: "k3", kind: "test", severity: "critical", title: "Nobody listening", body: "b" },
        { env: {}, fetchFn, now: () => NOW },
      );
      expect(result).toBe("logged");
      expect(calls).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Nobody listening"));
      expect(await db.select().from(schema.alerts).where(eq(schema.alerts.key, "k3"))).toHaveLength(1);
      warn.mockRestore();
    });

    it("does not throw when a channel is down", async () => {
      const fetchFn = vi.fn(async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch;
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const result = await notifyModule.notify(
        { key: "k4", kind: "test", severity: "warn", title: "Down", body: "b" },
        { env, fetchFn, now: () => NOW },
      );
      expect(result).toBe("logged");
      error.mockRestore();
      warn.mockRestore();
    });
  });
});
