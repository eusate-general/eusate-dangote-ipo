import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "@/lib/env";
import { computePhase } from "@/lib/phase";
import { toUsage } from "@/lib/anthropic-usage";
import { addUsage, EMPTY_USAGE } from "@/lib/pricing";
import { buildStaticSystem, buildVolatileSystem } from "@/lib/prompt";
import { runTool, TOOLS } from "./tools";
import type { ChatEngine, EngineEvent, EngineInput } from "./types";

const MAX_TOKENS = 1500;
const MAX_TOOL_ROUNDS = 3;
const REFUSAL_TEXT =
  "I can't help with that one. I'm here for questions about the Dangote refinery IPO, IPOs in general and basic investing.";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = getEnv().ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set (or set ANSWER_MODE=mock for local development)");
    client = new Anthropic({ apiKey, timeout: 60_000 });
  }
  return client;
}

/** Claude answers from the cached facts context, with deterministic calculator tools. */
export class DirectEngine implements ChatEngine {
  async *stream(input: EngineInput): AsyncGenerator<EngineEvent, void, void> {
    const env = getEnv();
    const model = env.ANSWER_MODEL;
    const { knowledge, now } = input;

    const system: Anthropic.TextBlockParam[] = [
      // Stable prefix (tools + rules + facts), cached for an hour.
      { type: "text", text: buildStaticSystem(knowledge), cache_control: { type: "ephemeral", ttl: "1h" } },
      // Changes per request, so it sits after the cache breakpoint.
      {
        type: "text",
        text: buildVolatileSystem({
          now,
          phase: computePhase(knowledge.ipo, now),
          news: input.news,
          changeSignals: input.changeSignals,
        }),
      },
    ];

    const messages: Anthropic.MessageParam[] = [
      ...input.history.map((t) => ({ role: t.role, content: t.content })),
      { role: "user", content: input.userMessage },
    ];

    let usage = EMPTY_USAGE;
    let stopReason: string | null = null;
    let emittedText = false;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const stream = getClient().messages.stream(
        {
          model,
          max_tokens: MAX_TOKENS,
          system,
          messages,
          tools: TOOLS,
          output_config: { effort: env.ANSWER_EFFORT },
        },
        { signal: input.signal },
      );

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          emittedText = true;
          yield { type: "delta", text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      usage = addUsage(usage, toUsage(final.usage));
      stopReason = final.stop_reason;

      const toolUses = final.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (final.stop_reason !== "tool_use" || toolUses.length === 0) break;
      if (round === MAX_TOOL_ROUNDS) break;

      messages.push({ role: "assistant", content: final.content });
      messages.push({
        role: "user",
        content: toolUses.map((use) => {
          const outcome = runTool(use.name, use.input, knowledge);
          return {
            type: "tool_result" as const,
            tool_use_id: use.id,
            content: outcome.content,
            is_error: outcome.isError,
          };
        }),
      });
    }

    if (stopReason === "refusal" && !emittedText) {
      yield { type: "delta", text: REFUSAL_TEXT };
    }
    yield { type: "done", usage, model, stopReason };
  }
}
