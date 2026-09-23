import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Runs only against a throwaway database:
//   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5544/dangote_ipo_test npm test
const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("lead capture against a database", () => {
  let submitLead: typeof import("@/lib/leads").submitLead;
  let schema: typeof import("@/lib/db/schema");
  let db: ReturnType<typeof import("@/lib/db/client").getDb>;

  beforeAll(async () => {
    if (!/test/i.test(TEST_DB ?? "")) throw new Error("TEST_DATABASE_URL must point at a database with 'test' in its name");
    process.env.DATABASE_URL = TEST_DB;
    ({ submitLead } = await import("@/lib/leads"));
    schema = await import("@/lib/db/schema");
    db = (await import("@/lib/db/client")).getDb();
  });

  beforeEach(async () => {
    await db.delete(schema.leads);
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await db?.delete(schema.leads);
    vi.unstubAllEnvs();
  });

  it("stores the lead even when no webhook is configured", async () => {
    const { id, forwarded } = await submitLead({ email: "a@example.com", visitorId: "v1", context: "homepage_card" });
    expect(forwarded).toBe(false);
    const [row] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
    expect(row).toMatchObject({ email: "a@example.com", visitorId: "v1", context: "homepage_card", webhookSentAt: null });
  });

  it("forwards to the webhook when configured and records success", async () => {
    // getEnv() caches on first call in this file's module instance, so a later vi.stubEnv alone
    // would not be seen — reset the module registry and re-import to pick up the new env var
    // (same fix already applied in tests/security.test.ts).
    vi.stubEnv("LEAD_WEBHOOK_URL", "https://hooks.example/lead");
    vi.resetModules();
    const fresh = await import("@/lib/leads");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    const { forwarded } = await fresh.submitLead({ email: "b@example.com", visitorId: "v2", context: "homepage_card" });
    expect(forwarded).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://hooks.example/lead",
      expect.objectContaining({ method: "POST", body: expect.stringContaining("b@example.com") }),
    );
    const [row] = await db.select().from(schema.leads).where(eq(schema.leads.email, "b@example.com"));
    expect(row.webhookSentAt).not.toBeNull();
    fetchSpy.mockRestore();
  });

  it("still stores the lead and never throws when the webhook fails", async () => {
    vi.stubEnv("LEAD_WEBHOOK_URL", "https://hooks.example/lead");
    vi.resetModules();
    const fresh = await import("@/lib/leads");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const { forwarded } = await fresh.submitLead({ email: "c@example.com", visitorId: "v3", context: "homepage_card" });
    expect(forwarded).toBe(false);
    const [row] = await db.select().from(schema.leads).where(eq(schema.leads.email, "c@example.com"));
    expect(row.webhookError).toContain("network down");
    fetchSpy.mockRestore();
  });
});
