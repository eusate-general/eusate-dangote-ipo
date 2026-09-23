import { describe, expect, it } from "vitest";
import { loadKnowledge } from "@/lib/knowledge/load";
import { IpoFactsSchema, PlatformsFileSchema } from "@/lib/knowledge/schema";

const k = loadKnowledge();
const clone = <T>(v: T): T => structuredClone(v);

describe("facts files", () => {
  it("load and validate", () => {
    expect(k.ipo.offer.price_ngn).toBeGreaterThan(0);
    expect(k.platforms.platforms.length).toBeGreaterThan(0);
    expect(k.guides.length).toBeGreaterThan(0);
  });

  it("keeps Daba out of the recommendable set (checked against the official list and absent)", () => {
    const daba = k.platforms.platforms.find((p) => p.id === "daba");
    expect(daba?.listing_status).toBe("not_listed");
    expect(daba?.verified_at).toBeTruthy();
  });

  it("never marks a platform official without a verification date", () => {
    for (const p of k.platforms.platforms) {
      if (p.listing_status === "official") expect(p.verified_at).toBeTruthy();
    }
  });
});

describe("schema guards", () => {
  it("rejects a confirmed fact with no verified_at", () => {
    const bad = clone(k.ipo);
    bad.offer.status = "confirmed";
    bad.offer.verified_at = null;
    expect(IpoFactsSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an opening date after the closing date", () => {
    const bad = clone(k.ipo);
    bad.timeline.opens.date = "2026-12-01";
    expect(IpoFactsSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate fact ids", () => {
    const bad = clone(k.ipo);
    bad.facts.push(clone(bad.facts[0]));
    expect(IpoFactsSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a platform that names an unknown source", () => {
    const bad = clone(k.platforms);
    bad.platforms[0].named_by = ["nope"];
    expect(PlatformsFileSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an official platform without verified_at", () => {
    const bad = clone(k.platforms);
    bad.platforms[0].listing_status = "official";
    delete bad.platforms[0].verified_at;
    expect(PlatformsFileSchema.safeParse(bad).success).toBe(false);
  });
});
