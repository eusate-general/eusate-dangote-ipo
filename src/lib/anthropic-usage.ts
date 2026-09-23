import type Anthropic from "@anthropic-ai/sdk";
import type { Usage } from "@/lib/pricing";

export function toUsage(u: Anthropic.Usage): Usage {
  return {
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
  };
}
