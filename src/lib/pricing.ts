export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export const EMPTY_USAGE: Usage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
    cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
  };
}

// USD per million tokens, from Anthropic's published rates as of the 2026-06 model table.
// Re-check when changing models. Unknown models use the most expensive row so the budget
// breaker errs on the safe side.
const RATES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-opus-5": { in: 5, out: 25 },
};
const FALLBACK_RATE = { in: 10, out: 50 };

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER_1H = 2; // we always request the 1-hour TTL

export function costUsd(usage: Usage, model: string): number {
  const rate = RATES[model] ?? FALLBACK_RATE;
  const perToken = (ratePerMillion: number) => ratePerMillion / 1_000_000;
  return (
    usage.input_tokens * perToken(rate.in) +
    usage.cache_read_input_tokens * perToken(rate.in) * CACHE_READ_MULTIPLIER +
    usage.cache_creation_input_tokens * perToken(rate.in) * CACHE_WRITE_MULTIPLIER_1H +
    usage.output_tokens * perToken(rate.out)
  );
}
