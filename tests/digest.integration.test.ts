import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Runs only against a throwaway database:
//   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5544/dangote_ipo_test npm test
const TEST_DB = process.env.TEST_DATABASE_URL;
const NOW = new Date("2026-09-20T09:00:00Z"); // 10:00 WAT, well inside "today"; yesterday is the report day

describe.skipIf(!TEST_DB)("daily digest against a database", () => {
  let buildDigestMetrics: typeof import("@/lib/digest/build").buildDigestMetrics;
  let formatDigest: typeof import("@/lib/digest/build").formatDigest;
  let schema: typeof import("@/lib/db/schema");
  let db: ReturnType<typeof import("@/lib/db/client").getDb>;

  beforeAll(async () => {
    if (!/test/i.test(TEST_DB ?? "")) throw new Error("TEST_DATABASE_URL must point at a database with 'test' in its name");
    process.env.DATABASE_URL = TEST_DB;
    ({ buildDigestMetrics, formatDigest } = await import("@/lib/digest/build"));
    schema = await import("@/lib/db/schema");
    db = (await import("@/lib/db/client")).getDb();
  });

  beforeEach(async () => {
    await db.delete(schema.events);
    await db.delete(schema.ingestRuns);
  });

  afterAll(async () => {
    await db?.delete(schema.events);
    await db?.delete(schema.ingestRuns);
  });

  const yesterday = (hour: string) => new Date(`2026-09-19T${hour}:00:00Z`);

  it("counts yesterday's WAT day only, distinctly, and sums cost", async () => {
    await db.insert(schema.events).values([
      // Yesterday (WAT): two distinct visitors, one sends two messages in one conversation.
      { visitorId: "v1", sessionId: "c1", type: "page_view", ts: yesterday("08") },
      { visitorId: "v1", sessionId: "c1", type: "message_sent", ts: yesterday("09") },
      { visitorId: "v1", sessionId: "c1", type: "answer_served", ts: yesterday("09"), props: { cost_usd: 0.01 } },
      { visitorId: "v1", sessionId: "c1", type: "message_sent", ts: yesterday("10") },
      { visitorId: "v1", sessionId: "c1", type: "answer_served", ts: yesterday("10"), props: { cost_usd: 0.02 } },
      { visitorId: "v2", sessionId: "c2", type: "page_view", ts: yesterday("11") }, // visited, never chatted
      // Today (WAT, after the report window) must NOT be counted.
      { visitorId: "v3", sessionId: "c3", type: "message_sent", ts: NOW },
      { visitorId: "v3", sessionId: "c3", type: "answer_served", ts: NOW, props: { cost_usd: 5 } },
      // Before yesterday must NOT be counted.
      { visitorId: "v4", sessionId: "c4", type: "message_sent", ts: new Date("2026-09-18T09:00:00Z") },
    ]);

    const m = await buildDigestMetrics(NOW);
    expect(m.dayLabel).toBe("2026-09-19");
    expect(m.uniqueVisitors).toBe(2); // v1 and v2, not v3 (today) or v4 (day before)
    expect(m.uniqueChatters).toBe(1); // only v1 sent a message yesterday
    expect(m.conversations).toBe(1);
    expect(m.messages).toBe(2);
    expect(m.spendUsd).toBeCloseTo(0.03);
  });

  it("counts feedback, the review-queue signals, and operational events separately", async () => {
    await db.insert(schema.events).values([
      { visitorId: "v1", type: "feedback", ts: yesterday("09"), props: { value: "up" } },
      { visitorId: "v1", type: "feedback", ts: yesterday("09"), props: { value: "up" } },
      { visitorId: "v1", type: "feedback", ts: yesterday("09"), props: { value: "down" } },
      { visitorId: "v1", type: "answer_served", ts: yesterday("09"), props: { cost_usd: 0, unbacked_numeric_claim: true, unknown_citations: 0 } },
      { visitorId: "v1", type: "answer_served", ts: yesterday("09"), props: { cost_usd: 0, unbacked_numeric_claim: false, unknown_citations: 2 } },
      { visitorId: "v1", type: "answer_served", ts: yesterday("09"), props: { cost_usd: 0, unbacked_numeric_claim: false, unknown_citations: 0 } },
      { visitorId: "v1", type: "budget_tripped", ts: yesterday("10") },
      { visitorId: "v1", type: "rate_limited", ts: yesterday("10") },
      { visitorId: "v1", type: "rate_limited", ts: yesterday("10") },
      { visitorId: "v1", type: "error", ts: yesterday("10") },
    ]);

    const m = await buildDigestMetrics(NOW);
    expect(m).toMatchObject({ feedbackUp: 2, feedbackDown: 1, unbackedClaims: 1, unknownCitations: 1, budgetTripped: 1, rateLimited: 2, errors: 1 });
  });

  it("reports the news feed as unhealthy when no ingest run exists", async () => {
    const m = await buildDigestMetrics(NOW);
    expect(m.newsIngestOk).toBe(false);
    expect(formatDigest(m).body).toContain("no successful run found");
  });

  it("reports news health from the real ingest_runs table", async () => {
    await db.insert(schema.ingestRuns).values({
      startedAt: yesterday("23"),
      finishedAt: yesterday("23"),
      ok: true,
      sourcesTotal: 10,
      sourcesFailed: 0,
      fetched: 5,
      newItems: 5,
      relevantItems: 2,
    });
    const m = await buildDigestMetrics(NOW);
    expect(m.newsIngestOk).toBe(true);
    expect(m.newsAgeMinutes).not.toBeNull();
    expect(formatDigest(m).body).toContain("healthy");
  });

  it("omits zero-count operational lines but always includes the headline numbers", () => {
    const body = formatDigest({
      dayLabel: "2026-09-19",
      uniqueVisitors: 3,
      uniqueChatters: 1,
      conversations: 1,
      messages: 2,
      spendUsd: 0.03,
      feedbackUp: 0,
      feedbackDown: 0,
      unbackedClaims: 0,
      unknownCitations: 0,
      budgetTripped: 0,
      rateLimited: 0,
      errors: 0,
      newsIngestOk: true,
      newsAgeMinutes: 12,
    }).body;
    expect(body).toContain("Visitors: 3 unique");
    expect(body).not.toMatch(/Budget cap|Rate limit triggered|server error/);
  });
});
