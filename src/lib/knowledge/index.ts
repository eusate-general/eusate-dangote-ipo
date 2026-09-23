import raw from "@/generated/knowledge.json";
import { KnowledgeSchema, type Knowledge } from "./schema";

let cached: Knowledge | null = null;

export function getKnowledge(): Knowledge {
  cached ??= KnowledgeSchema.parse(raw);
  return cached;
}
