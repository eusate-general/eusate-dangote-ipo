import { describe, expect, it } from "vitest";
import { buildCatalog, CITATION_PATTERN, linkifyCitations, type SourceEntry } from "@/lib/catalog";
import { loadKnowledge } from "@/lib/knowledge/load";
import { computePhase } from "@/lib/phase";
import { buildStaticSystem, buildVolatileSystem } from "@/lib/prompt";

const k = loadKnowledge();
const catalog = buildCatalog(k);
const byId = new Map<string, SourceEntry>(catalog.map((e) => [e.id, e]));

describe("static system prompt", () => {
  const text = buildStaticSystem(k);

  it("is deterministic, so prompt caching works", () => {
    expect(buildStaticSystem(k)).toBe(text);
  });

  it("carries no time-dependent content", () => {
    // The rules may name the live-state section, but no actual timestamp, phase line or countdown.
    expect(text).not.toMatch(/TODAY:|PHASE:|Closes in \d|\d{2}:\d{2} WAT/);
  });

  it("states the offer figures exactly as in the facts file", () => {
    expect(text).toContain("₦525 per share");
    expect(text).toContain("10 shares (₦5,250)");
    expect(text).toContain("14 Sep 2026");
    expect(text).toContain("13 Oct 2026");
  });

  it("never puts an 'unverified' warning in front of users, whatever the fact status", () => {
    // The rules name the forbidden phrase in order to forbid it, so check the data the model reads.
    const context = text.slice(text.indexOf("# CONTEXT"));
    expect(context).not.toMatch(/not yet verified|not yet checked/i);
    expect(text).toContain("Never mention or comment on how facts were verified");
    expect(context).toContain("from press reports"); // the "requirements" fact is still press-only
    expect(context).toContain("checked by Eusate on"); // offer/timeline/official_channels are now confirmed
  });

  it("shows a positive 'checked by Eusate' mark only once a human confirms a fact", () => {
    const confirmed = structuredClone(k);
    confirmed.ipo.offer.status = "confirmed";
    confirmed.ipo.offer.verified_at = "2026-09-20";
    expect(buildStaticSystem(confirmed)).toContain("checked by Eusate on 20 Sep 2026");
  });

  it("marks Daba as checked-and-absent, never to be recommended", () => {
    expect(text).toMatch(/\[\[platform:daba\]\] Daba Finance[^\n]*NOT LISTED[^\n]*never recommend/);
  });

  it("only uses citation markers that exist in the catalog", () => {
    const used = [...text.matchAll(CITATION_PATTERN)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(20);
    for (const id of used) expect(byId.has(id), `missing catalog entry for ${id}`).toBe(true);
  });

  it("gives every catalog entry a marker in the prompt", () => {
    for (const entry of catalog) expect(text).toContain(`[[${entry.id}]]`);
  });
});

describe("volatile system prompt", () => {
  it("shows today's date and phase while the offer is open", () => {
    const now = new Date("2026-09-19T13:05:00Z");
    const text = buildVolatileSystem({ now, phase: computePhase(k.ipo, now) });
    expect(text).toContain("TODAY: Sat 19 Sep 2026, 14:05 WAT");
    expect(text).toContain("Offer open");
    expect(text).toContain("Closes in 24 day(s) on 13 Oct 2026");
  });

  it("forbids saying people can still subscribe once the offer has closed", () => {
    const now = new Date("2026-10-20T10:00:00Z");
    const text = buildVolatileSystem({ now, phase: computePhase(k.ipo, now) });
    expect(text).toContain("Offer closed, awaiting allotment");
    expect(text).toContain("Do not tell anyone they can still subscribe");
  });

  it("includes change signals when present and admits when there is no news feed", () => {
    const now = new Date("2026-09-19T10:00:00Z");
    const text = buildVolatileSystem({
      now,
      phase: computePhase(k.ipo, now),
      changeSignals: ["Two outlets report the offer may close early"],
    });
    expect(text).toContain("CHANGE SIGNALS: Two outlets report the offer may close early");
    expect(text).toContain("no news feed is connected yet");
  });
});

describe("linkifyCitations", () => {
  it("numbers distinct citations in order and reuses numbers for repeats", () => {
    const { markdown, cited } = linkifyCitations(
      "Price is ₦525 [[fact:offer]]. Closes 13 Oct [[fact:timeline]]. Again [[fact:offer]].",
      byId,
    );
    expect(markdown).toBe("Price is ₦525 [1](#cite-1). Closes 13 Oct [2](#cite-2). Again [1](#cite-1).");
    expect(cited.map((c) => c.id)).toEqual(["fact:offer", "fact:timeline"]);
  });

  it("drops markers that are not in the catalog", () => {
    const { markdown, cited } = linkifyCitations("Made up [[fact:invented]] claim.", byId);
    expect(markdown).toBe("Made up  claim.");
    expect(cited).toHaveLength(0);
  });

  it("hides a marker that is still streaming in", () => {
    expect(linkifyCitations("Price is ₦525 [[fact:of", byId).markdown).toBe("Price is ₦525 ");
    expect(linkifyCitations("Price is ₦525 [", byId).markdown).toBe("Price is ₦525 [");
  });
});
