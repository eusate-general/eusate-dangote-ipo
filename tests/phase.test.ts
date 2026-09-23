import { describe, expect, it } from "vitest";
import { loadKnowledge } from "@/lib/knowledge/load";
import type { IpoFacts } from "@/lib/knowledge/schema";
import { computePhase } from "@/lib/phase";

const ipo = loadKnowledge().ipo; // opens 2026-09-14, closes 2026-10-13 (WAT dates)

function withTimeline(patch: Partial<IpoFacts["timeline"]>, phase_override: IpoFacts["phase_override"] = null): IpoFacts {
  return { ...ipo, phase_override, timeline: { ...ipo.timeline, ...patch } };
}

const source = [{ name: "test", url: "https://example.com/" }];
const dated = (date: string) => ({ date, status: "reported" as const, verified_at: null, sources: source });

describe("computePhase", () => {
  it("is PRE_OPEN the day before opening", () => {
    const info = computePhase(ipo, new Date("2026-09-13T12:00:00Z"));
    expect(info.phase).toBe("PRE_OPEN");
    expect(info.daysToOpen).toBe(1);
  });

  it("uses the WAT calendar day, not the UTC day, at the opening edge", () => {
    // 23:30 UTC on 13 Sep is 00:30 WAT on 14 Sep.
    expect(computePhase(ipo, new Date("2026-09-13T23:30:00Z")).phase).toBe("OPEN");
    expect(computePhase(ipo, new Date("2026-09-13T22:59:00Z")).phase).toBe("PRE_OPEN");
  });

  it("counts days to close and stays OPEN through the last WAT day", () => {
    const mid = computePhase(ipo, new Date("2026-09-19T10:00:00Z"));
    expect(mid.phase).toBe("OPEN");
    expect(mid.daysToClose).toBe(24);

    const lastMinute = computePhase(ipo, new Date("2026-10-13T22:59:00Z")); // 23:59 WAT
    expect(lastMinute.phase).toBe("OPEN");
    expect(lastMinute.daysToClose).toBe(0);
  });

  it("flips to CLOSED_AWAITING_ALLOTMENT at midnight WAT after the closing date", () => {
    const info = computePhase(ipo, new Date("2026-10-13T23:00:00Z")); // 00:00 WAT on 14 Oct
    expect(info.phase).toBe("CLOSED_AWAITING_ALLOTMENT");
    expect(info.daysToClose).toBeNull();
  });

  it("moves to ALLOTTED and LISTED only when those dates are known and reached", () => {
    const known = withTimeline({ allotment: dated("2026-10-27"), listing: dated("2026-11-10") });
    expect(computePhase(known, new Date("2026-10-20T10:00:00Z")).phase).toBe("CLOSED_AWAITING_ALLOTMENT");
    expect(computePhase(known, new Date("2026-10-27T10:00:00Z")).phase).toBe("ALLOTTED");
    expect(computePhase(known, new Date("2026-11-10T10:00:00Z")).phase).toBe("LISTED");
  });

  it("never invents ALLOTTED or LISTED without dates", () => {
    expect(computePhase(ipo, new Date("2027-01-01T00:00:00Z")).phase).toBe("CLOSED_AWAITING_ALLOTMENT");
  });

  it("lets a manual override win", () => {
    const info = computePhase(withTimeline({}, "CLOSED_AWAITING_ALLOTMENT"), new Date("2026-09-19T10:00:00Z"));
    expect(info.phase).toBe("CLOSED_AWAITING_ALLOTMENT");
    expect(info.overridden).toBe(true);
  });
});
