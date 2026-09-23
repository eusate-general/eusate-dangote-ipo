import { getEnv } from "@/lib/env";
import { DirectEngine } from "./direct";
import { MockEngine } from "./mock";
import type { ChatEngine } from "./types";

let engine: ChatEngine | null = null;

export function getEngine(): ChatEngine {
  engine ??= getEnv().ANSWER_MODE === "mock" ? new MockEngine() : new DirectEngine();
  return engine;
}

export type { ChatEngine, ChatTurn, EngineEvent, EngineInput } from "./types";
