import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Runs only against a throwaway database:
//   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5544/dangote_ipo_test npm test
const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("rate limiting against a database", () => {
  let checkRateLimit: typeof import("@/lib/security/ratelimit").checkRateLimit;
  let schema: typeof import("@/lib/db/schema");
  let db: ReturnType<typeof import("@/lib/db/client").getDb>;

  beforeAll(async () => {
    if (!/test/i.test(TEST_DB ?? "")) throw new Error("TEST_DATABASE_URL must point at a database with 'test' in its name");
    process.env.DATABASE_URL = TEST_DB;
    ({ checkRateLimit } = await import("@/lib/security/ratelimit"));
    schema = await import("@/lib/db/schema");
    db = (await import("@/lib/db/client")).getDb();
  });

  beforeEach(async () => {
    await db.delete(schema.rateLimitBuckets);
  });

  afterAll(async () => {
    await db?.delete(schema.rateLimitBuckets);
  });

  it("allows up to the limit within a window, then blocks", async () => {
    const now = new Date("2026-09-19T12:00:00Z");
    for (let i = 1; i <= 3; i++) {
      const r = await checkRateLimit("k1", 60_000, 3, now);
      expect(r).toMatchObject({ allowed: true, count: i, limit: 3 });
    }
    const blocked = await checkRateLimit("k1", 60_000, 3, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(4);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets once the window rolls over", async () => {
    const windowMs = 60_000;
    const start = new Date("2026-09-19T12:00:00.000Z");
    await checkRateLimit("k2", windowMs, 2, start);
    await checkRateLimit("k2", windowMs, 2, start);
    expect((await checkRateLimit("k2", windowMs, 2, start)).allowed).toBe(false);

    const nextWindow = new Date(start.getTime() + windowMs);
    const afterReset = await checkRateLimit("k2", windowMs, 2, nextWindow);
    expect(afterReset).toMatchObject({ allowed: true, count: 1 });
  });

  it("keeps separate keys fully independent", async () => {
    const now = new Date("2026-09-19T12:00:00Z");
    await checkRateLimit("ip:1.1.1.1", 60_000, 1, now);
    const other = await checkRateLimit("ip:2.2.2.2", 60_000, 1, now);
    expect(other).toMatchObject({ allowed: true, count: 1 });
  });

  it("survives concurrent requests for a brand-new key without losing a count", async () => {
    const now = new Date("2026-09-19T12:00:00Z");
    const results = await Promise.all(Array.from({ length: 10 }, () => checkRateLimit("burst", 60_000, 100, now)));
    expect(new Set(results.map((r) => r.count)).size).toBe(10); // every increment landed exactly once
    expect(Math.max(...results.map((r) => r.count))).toBe(10);
  });
});
