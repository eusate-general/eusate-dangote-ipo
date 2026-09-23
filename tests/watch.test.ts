import { describe, expect, it } from "vitest";
import { evaluateCheck, hashText, normalizeText } from "@/lib/watch/diff";

describe("normalizeText", () => {
  it("collapses whitespace and strips clock-like timestamps", () => {
    expect(normalizeText("Price   ₦525\n\nOpens  14 Sep")).toBe("Price ₦525 Opens 14 Sep");
    expect(normalizeText("Updated at 10:32 am today")).toBe("Updated at today");
    expect(normalizeText("Session 14:05:22 expires")).toBe("Session expires");
  });
});

describe("evaluateCheck", () => {
  it("treats the first ever check as a baseline, not a change", () => {
    const out = evaluateCheck("Price ₦525", null);
    expect(out).toMatchObject({ changed: false, isFirstCheck: true });
    expect(out.hash).toBe(hashText("Price ₦525"));
  });

  it("reports no change when the text is identical, even with cosmetic differences", () => {
    const first = evaluateCheck("Price   ₦525", null);
    const second = evaluateCheck("Price ₦525", first.hash);
    expect(second.changed).toBe(false);
    expect(second.isFirstCheck).toBe(false);
  });

  it("reports a real change when the content differs", () => {
    const first = evaluateCheck("Closes 13 Oct 2026", null);
    const second = evaluateCheck("Closes 20 Oct 2026", first.hash);
    expect(second).toMatchObject({ changed: true, isFirstCheck: false });
  });

  it("is not fooled by a timestamp-only difference", () => {
    const first = evaluateCheck("Page loaded at 09:15 am. Price ₦525.", null);
    const second = evaluateCheck("Page loaded at 14:02 pm. Price ₦525.", first.hash);
    expect(second.changed).toBe(false);
  });
});
