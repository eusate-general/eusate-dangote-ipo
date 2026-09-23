import { describe, expect, it } from "vitest";
import { analyzeGrounding } from "@/lib/grounding";

const known = new Set(["fact:offer", "platform:bamboo"]);

describe("analyzeGrounding", () => {
  it("counts only markers that resolve against the known catalog", () => {
    const g = analyzeGrounding("Price is ₦525 [[fact:offer]]. See [[platform:bamboo]] and [[fact:invented]].", known);
    expect(g.citations).toBe(2);
    expect(g.unknownCitations).toBe(1);
  });

  it("flags a specific figure with no citation anywhere in the answer", () => {
    expect(analyzeGrounding("The minimum is ₦5,250.", known).unbackedNumericClaim).toBe(true);
    expect(analyzeGrounding("The minimum is ₦5,250 [[fact:offer]].", known).unbackedNumericClaim).toBe(false);
  });

  it("does not flag prose with no specific figures", () => {
    const g = analyzeGrounding("I can't tell you whether to invest, that's your call.", known);
    expect(g.hasNumericClaim).toBe(false);
    expect(g.unbackedNumericClaim).toBe(false);
  });

  it("recognises percentages, large numbers and share counts as claims", () => {
    for (const text of ["up to 30% extra", "4,100,000,000 shares", "10 shares minimum", "4.1 billion shares"]) {
      expect(analyzeGrounding(text, known).hasNumericClaim, text).toBe(true);
    }
  });

  it("is a whole-answer proxy: a citation anywhere clears every figure in that answer", () => {
    // Documents the known limitation: this cannot tell whether the citation actually
    // supports the specific figure next to it, only whether the answer cites anything at all.
    const g = analyzeGrounding("₦525 per share. Unrelated fact: ₦999,999 [[fact:offer]].", known);
    expect(g.unbackedNumericClaim).toBe(false);
  });
});
