import { describe, expect, it } from "vitest";
import { costForShares, sharesForAmount } from "@/lib/calc";
import { runTool } from "@/lib/engine/tools";
import { formatBig, formatNgn } from "@/lib/format";
import { loadKnowledge } from "@/lib/knowledge/load";
import { costUsd } from "@/lib/pricing";
import { createSseParser, encodeSse } from "@/lib/sse";
import { daysBetween, formatDate, formatWatDateTime, startOfWatDay, watDate } from "@/lib/time";

describe("calc", () => {
  it("computes whole shares, cost and leftover", () => {
    const r = sharesForAmount(100_000, 525, 10);
    expect(r.shares).toBe(190);
    expect(r.cost_ngn).toBe(99_750);
    expect(r.leftover_ngn).toBe(250);
    expect(r.meets_minimum).toBe(true);
  });

  it("flags an amount below the minimum", () => {
    const r = sharesForAmount(5_000, 525, 10);
    expect(r.shares).toBe(9);
    expect(r.meets_minimum).toBe(false);
    expect(r.min_cost_ngn).toBe(5_250);
  });

  it("prices a share count", () => {
    expect(costForShares(10, 525, 10).cost_ngn).toBe(5_250);
    expect(costForShares(0, 525, 10).meets_minimum).toBe(false);
  });

  it("rejects negative, non-finite and fractional input", () => {
    expect(() => sharesForAmount(-1, 525, 10)).toThrow();
    expect(() => sharesForAmount(Number.NaN, 525, 10)).toThrow();
    expect(() => costForShares(1.5, 525, 10)).toThrow();
  });
});

describe("runTool", () => {
  const k = loadKnowledge();

  it("runs a valid call with the price from the facts file", () => {
    const out = runTool("cost_for_shares", { shares: 100 }, k);
    expect(out.isError).toBe(false);
    expect(JSON.parse(out.content).cost_ngn).toBe(52_500);
  });

  it("reports bad input and unknown tools as errors instead of throwing", () => {
    expect(runTool("shares_for_amount", { amount_ngn: "lots" }, k).isError).toBe(true);
    expect(runTool("cost_for_shares", { shares: 2.5 }, k).isError).toBe(true);
    expect(runTool("drop_tables", {}, k).isError).toBe(true);
  });
});

describe("format", () => {
  it("formats naira and big numbers", () => {
    expect(formatNgn(5_250)).toBe("₦5,250");
    expect(formatNgn(525)).toBe("₦525");
    expect(formatBig(4_100_000_000)).toBe("4.1 billion");
    expect(formatBig(2_150_000_000_000)).toBe("2.15 trillion");
  });
});

describe("time", () => {
  it("works in WAT (UTC+1)", () => {
    expect(watDate(new Date("2026-09-13T23:30:00Z"))).toBe("2026-09-14");
    expect(startOfWatDay(new Date("2026-09-14T10:00:00Z")).toISOString()).toBe("2026-09-13T23:00:00.000Z");
    expect(daysBetween("2026-09-19", "2026-10-13")).toBe(24);
    expect(formatDate("2026-09-14")).toBe("14 Sep 2026");
    expect(formatWatDateTime(new Date("2026-09-19T13:05:00Z"))).toBe("Sat 19 Sep 2026, 14:05 WAT");
  });
});

describe("pricing", () => {
  it("prices each token class for claude-sonnet-5", () => {
    expect(costUsd({ input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, "claude-sonnet-5")).toBeCloseTo(0.002);
    expect(costUsd({ input_tokens: 0, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, "claude-sonnet-5")).toBeCloseTo(0.01);
    expect(costUsd({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 10_000, cache_creation_input_tokens: 0 }, "claude-sonnet-5")).toBeCloseTo(0.002);
    expect(costUsd({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 1000 }, "claude-sonnet-5")).toBeCloseTo(0.004);
  });

  it("uses the most expensive rate for an unknown model", () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    expect(costUsd(usage, "some-future-model")).toBeGreaterThan(costUsd(usage, "claude-opus-5"));
  });
});

describe("sse", () => {
  it("round-trips events even when chunks split a frame", () => {
    const wire =
      encodeSse({ event: "delta", data: { text: "Hello ₦525" } }) + encodeSse({ event: "done", data: { messageId: "m1" } });
    const parse = createSseParser();
    const out = [...parse(wire.slice(0, 17)), ...parse(wire.slice(17, 60)), ...parse(wire.slice(60))];
    expect(out).toEqual([
      { event: "delta", data: { text: "Hello ₦525" } },
      { event: "done", data: { messageId: "m1" } },
    ]);
  });

  it("skips a malformed frame without failing the stream", () => {
    const parse = createSseParser();
    const out = parse('event: delta\ndata: {oops\n\n' + encodeSse({ event: "done", data: { messageId: "m1" } }));
    expect(out).toEqual([{ event: "done", data: { messageId: "m1" } }]);
  });
});
