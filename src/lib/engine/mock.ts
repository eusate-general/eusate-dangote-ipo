import { formatNgn } from "@/lib/format";
import { formatDate } from "@/lib/time";
import type { Knowledge } from "@/lib/knowledge/schema";
import type { ChatEngine, EngineEvent, EngineInput } from "./types";

function mockReply(message: string, k: Knowledge): string {
  const { offer, timeline } = k.ipo;
  const text = message.toLowerCase();

  if (/should i|worth it|good investment|will it (go|rise)|predict/.test(text)) {
    return "I can't tell you whether to invest or predict prices. What I can say: shares can lose value and allotment isn't guaranteed, so weigh how much you can afford to lose and your timeline, and consider a licensed stockbroker. [[guide:ipo-basics]]";
  }
  if (/price|cost|how much|minimum|naira|₦/.test(text)) {
    return `The offer price is reported as ${formatNgn(offer.price_ngn)} per share, with a minimum of ${offer.min_shares} shares (${formatNgn(offer.price_ngn * offer.min_shares)}). Figures can change, so confirm on ipo.dangote.com. [[fact:offer]]`;
  }
  if (/when|close|open|date|deadline|time/.test(text)) {
    return `The offer is reported to open on ${formatDate(timeline.opens.date)} and close on ${formatDate(timeline.closes.date)}. Your platform may have an earlier cut-off, so check with it. [[fact:timeline]]`;
  }
  if (/platform|where|buy|subscribe|bank|app|bamboo|piggy/.test(text)) {
    const some = k.platforms.platforms.filter((p) => p.listing_status === "reported").slice(0, 3);
    const list = some.map((p) => `${p.name} [[platform:${p.id}]]`).join(", ");
    return `Some platforms named as approved in press coverage include ${list}. Confirm the current official list on ipo.dangote.com before you pay anything.`;
  }
  if (/eusate/.test(text)) {
    return "Eusate builds AI customer-support software for businesses, and this guide is a free public project by Eusate. [[eusate]]";
  }
  return "This is the mock engine used for local development. Ask about the price, dates, platforms or Eusate to see a sample answer.";
}

/** Deterministic stand-in for local development and tests. Never used when ANSWER_MODE=live. */
export class MockEngine implements ChatEngine {
  async *stream(input: EngineInput): AsyncGenerator<EngineEvent, void, void> {
    const reply = mockReply(input.userMessage, input.knowledge);
    for (const word of reply.split(/(?<=\s)/)) {
      if (input.signal?.aborted) return;
      await new Promise((resolve) => setTimeout(resolve, 12));
      yield { type: "delta", text: word };
    }
    yield {
      type: "done",
      usage: {
        input_tokens: 1200,
        output_tokens: Math.ceil(reply.length / 4),
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      model: "mock",
      stopReason: "end_turn",
    };
  }
}
