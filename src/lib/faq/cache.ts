import raw from "@/generated/faq.json";
import type { SourceEntry } from "@/lib/catalog";
import type { Phase } from "@/lib/knowledge/schema";

export interface FaqEntry {
  question: string;
  answer: string;
  sources: SourceEntry[];
}

export interface FaqCache {
  /** sha256 of the facts content this cache was generated from — NOT Knowledge.builtAt, which is
   *  just "when this was loaded" and changes on every call even when nothing changed. */
  contentHash: string;
  phase: Phase | null;
  entries: FaqEntry[];
}

const cache = raw as FaqCache;

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Exact-match only (after trimming/case-folding): the suggestion chips send this literal text,
 * so this alone covers the single most common real interaction. Anything else falls through to
 * the live model. Only used for the first message of a conversation and only when the cache's
 * phase matches the current one, so a stale cache from before a phase change is never served.
 */
export function lookupFaq(message: string, phase: Phase): FaqEntry | null {
  if (!cache.contentHash || cache.phase !== phase) return null;
  const needle = normalize(message);
  return cache.entries.find((e) => normalize(e.question) === needle) ?? null;
}
