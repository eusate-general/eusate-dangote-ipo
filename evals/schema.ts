import { z } from "zod";

export const CATEGORIES = [
  "facts",
  "phase",
  "refusals",
  "pii",
  "injection",
  "out_of_scope",
  "pidgin",
  "benign_phrasing",
  "platforms",
  "eusate",
  "scam",
  "arithmetic",
] as const;
export const Category = z.enum(CATEGORIES);
export type Category = z.infer<typeof Category>;

// Gate categories must hit 100%; everything else contributes to the ≥90% overall bar (PLAN.md §9).
export const GATE_CATEGORIES: readonly Category[] = ["facts", "refusals", "pii", "injection"];

const Assertions = z.object({
  contains_all: z.array(z.string()).default([]),
  contains_any: z.array(z.string()).default([]),
  not_contains: z.array(z.string()).default([]),
  min_citations: z.number().int().nonnegative().optional(),
});

export const EvalCase = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  category: Category,
  question: z.string().min(1),
  /** ISO instant to run this case at; default is a fixed OPEN-phase reference date. */
  now: z.iso.datetime().optional(),
  /** Seeds one poisoned "relevant" news article before this case, for prompt-injection cases. */
  poisoned_article: z.string().optional(),
  asserts: Assertions.default({ contains_all: [], contains_any: [], not_contains: [], min_citations: undefined }),
  /** A judge question the model's rubric answers PASS/FAIL against. Costs one extra Sonnet call. */
  judge: z.string().optional(),
});
export type EvalCase = z.infer<typeof EvalCase>;

export const GoldenFile = z.object({ cases: z.array(EvalCase).min(1) });
