import { CITATION_PATTERN } from "@/lib/catalog";

// Coarse, whole-answer proxy — not a hallucination detector. It cannot tell whether a citation
// actually supports the sentence next to it, only whether the answer cites anything at all.
// Use it to sample answers for review, not to judge or block a single answer.
// The %-branch has no trailing \b: "%" is a non-word char, so \b never matches right after it.
const NUMERIC_CLAIM = /₦[\d,.]+|\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s*(?:million|billion|trillion|shares)\b/i;

export interface GroundingSignal {
  /** [[id]] markers that resolve against the known catalog (facts, platforms, guides, news, Eusate). */
  citations: number;
  /** Markers the model wrote that do not resolve. These never render as links, but are worth reviewing. */
  unknownCitations: number;
  /** The answer contains a specific figure (₦, %, a large number, a share count). */
  hasNumericClaim: boolean;
  /** Specific figures with zero citations anywhere in the answer. Flags an answer for review, nothing more. */
  unbackedNumericClaim: boolean;
}

export function analyzeGrounding(text: string, knownIds: ReadonlySet<string>): GroundingSignal {
  let citations = 0;
  let unknownCitations = 0;
  for (const match of text.matchAll(CITATION_PATTERN)) {
    if (knownIds.has(match[1])) citations++;
    else unknownCitations++;
  }
  const hasNumericClaim = NUMERIC_CLAIM.test(text);
  return { citations, unknownCitations, hasNumericClaim, unbackedNumericClaim: hasNumericClaim && citations === 0 };
}
