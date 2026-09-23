import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AlertInput } from "@/lib/notify";
import type { WatchedPage } from "@/lib/watch/pages";

// Runs only against a throwaway database:
//   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5544/dangote_ipo_test npm test
const TEST_DB = process.env.TEST_DATABASE_URL;

const PAGES: WatchedPage[] = [
  { id: "a", url: "https://x.example/a", label: "Page A" },
  { id: "b", url: "https://x.example/b", label: "Page B" },
];

describe.skipIf(!TEST_DB)("primary-source watcher against a database", () => {
  let runWatch: typeof import("@/lib/watch/run").runWatch;
  let schema: typeof import("@/lib/db/schema");
  let db: ReturnType<typeof import("@/lib/db/client").getDb>;

  const alertsSent: AlertInput[] = [];
  const run = (render: (url: string) => Promise<string>, pages = PAGES) =>
    runWatch({ render, pages, notifyFn: async (a) => void alertsSent.push(a) });

  beforeAll(async () => {
    if (!/test/i.test(TEST_DB ?? "")) throw new Error("TEST_DATABASE_URL must point at a database with 'test' in its name");
    process.env.DATABASE_URL = TEST_DB;
    ({ runWatch } = await import("@/lib/watch/run"));
    schema = await import("@/lib/db/schema");
    db = (await import("@/lib/db/client")).getDb();
  });

  beforeEach(async () => {
    alertsSent.length = 0;
    await db.delete(schema.sourceChecks);
    await db.delete(schema.alerts);
  });

  afterAll(async () => {
    await db?.delete(schema.sourceChecks);
    await db?.delete(schema.alerts);
  });

  it("saves a baseline on the first run and does not alert", async () => {
    const summary = await run(async () => "Price ₦525, closes 13 Oct 2026");
    expect(summary.ok).toBe(true);
    expect(summary.changedCount).toBe(0);
    expect(alertsSent).toHaveLength(0);

    const rows = await db.select().from(schema.sourceChecks);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.contentHash && r.lastCheckedAt)).toBe(true);
  });

  it("does not alert when a re-render is byte-identical", async () => {
    await run(async () => "Price ₦525");
    const summary = await run(async () => "Price ₦525");
    expect(summary.changedCount).toBe(0);
    expect(alertsSent).toHaveLength(0);
  });

  it("alerts once per changed page, names the page, and never touches facts files", async () => {
    await run(async (url) => (url.endsWith("/a") ? "Price ₦525" : "Min 10 shares"));
    const summary = await run(async (url) => (url.endsWith("/a") ? "Price ₦550" : "Min 10 shares"));

    expect(summary.changedCount).toBe(1);
    expect(alertsSent).toHaveLength(1);
    expect(alertsSent[0]).toMatchObject({ kind: "primary_source_change", severity: "warn" });
    expect(alertsSent[0].title).toContain("Page A");
    expect(alertsSent[0].body).toContain("facts/ipo.yaml");
    expect(alertsSent[0].body).not.toMatch(/wrote|updated|saved/i); // it must describe alerting, not autonomous editing
  });

  it("keeps going and reports a per-page failure without losing the other pages", async () => {
    const summary = await run(async (url) => {
      if (url.endsWith("/a")) throw new Error("timeout");
      return "Min 10 shares";
    });
    expect(summary.ok).toBe(true); // 1 of 2 succeeded
    expect(summary.results.find((r) => r.id === "a")).toMatchObject({ ok: false, error: "timeout" });
    expect(summary.results.find((r) => r.id === "b")).toMatchObject({ ok: true, isFirstCheck: true });
  });

  it("alerts when every page fails", async () => {
    const summary = await run(async () => {
      throw new Error("blocked");
    });
    expect(summary.ok).toBe(false);
    expect(alertsSent.some((a) => a.key === "source_watch:all-failed")).toBe(true);
  });
});
