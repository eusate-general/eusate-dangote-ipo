import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { costForShares, sharesForAmount } from "@/lib/calc";
import type { Knowledge } from "@/lib/knowledge/schema";

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "shares_for_amount",
    description:
      "Given an amount of naira, returns how many whole shares it buys at the offer price, the cost, the leftover, and whether it meets the minimum application. Use this for any 'how many shares can I get for ₦X' question. Never calculate by hand.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { amount_ngn: { type: "number", description: "Amount in naira, e.g. 100000" } },
      required: ["amount_ngn"],
      additionalProperties: false,
    },
  },
  {
    name: "cost_for_shares",
    description:
      "Given a number of shares, returns the total cost in naira at the offer price and whether it meets the minimum application. Use this for any 'how much for N shares' question. Never calculate by hand.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { shares: { type: "integer", description: "Number of shares, e.g. 500" } },
      required: ["shares"],
      additionalProperties: false,
    },
  },
];

const AmountInput = z.object({ amount_ngn: z.number().nonnegative() });
const SharesInput = z.object({ shares: z.number().int().nonnegative() });

export interface ToolOutcome {
  content: string;
  isError: boolean;
}

export function runTool(name: string, input: unknown, k: Knowledge): ToolOutcome {
  const { price_ngn, min_shares } = k.ipo.offer;
  try {
    if (name === "shares_for_amount") {
      const { amount_ngn } = AmountInput.parse(input);
      return { content: JSON.stringify(sharesForAmount(amount_ngn, price_ngn, min_shares)), isError: false };
    }
    if (name === "cost_for_shares") {
      const { shares } = SharesInput.parse(input);
      return { content: JSON.stringify(costForShares(shares, price_ngn, min_shares)), isError: false };
    }
    return { content: `Unknown tool: ${name}`, isError: true };
  } catch (err) {
    const message = err instanceof z.ZodError ? "Invalid input for this tool." : err instanceof Error ? err.message : "Tool failed.";
    return { content: message, isError: true };
  }
}
