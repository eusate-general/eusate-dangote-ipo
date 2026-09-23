import type { Knowledge } from "@/lib/knowledge/schema";
import type { Usage } from "@/lib/pricing";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface EngineInput {
  /** Earlier turns, oldest first. Already redacted. */
  history: ChatTurn[];
  /** The new user message. Already redacted. */
  userMessage: string;
  now: Date;
  knowledge: Knowledge;
  /** Recent press reports for this turn. Undefined means the news feed could not be read. */
  news?: { text: string | null; note: string | null };
  /** Independent reports of a change to dates, terms or platforms. */
  changeSignals?: string[];
  signal?: AbortSignal;
}

export type EngineEvent =
  | { type: "delta"; text: string }
  | { type: "done"; usage: Usage; model: string; stopReason: string | null };

/** The seam that lets Eusate become the brain later: swap the implementation, keep the app. */
export interface ChatEngine {
  stream(input: EngineInput): AsyncGenerator<EngineEvent, void, void>;
}
