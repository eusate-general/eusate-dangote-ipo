import { and, asc, eq, sql } from "drizzle-orm";
import { isOverBudget } from "@/lib/budget";
import { buildCatalog } from "@/lib/catalog";
import { getDb } from "@/lib/db/client";
import { conversations, messages } from "@/lib/db/schema";
import { getEngine, type ChatTurn } from "@/lib/engine";
import { logEvent } from "@/lib/events";
import { lookupFaq } from "@/lib/faq/cache";
import { analyzeGrounding } from "@/lib/grounding";
import { getKnowledge } from "@/lib/knowledge";
import { buildNewsContext } from "@/lib/news/context";
import { computePhase } from "@/lib/phase";
import { costUsd, EMPTY_USAGE } from "@/lib/pricing";
import { redactPii } from "@/lib/redact";
import type { ServerEvent } from "@/lib/sse";

let catalogIdCache: { builtAt: string; ids: Set<string> } | null = null;

/** IDs a [[marker]] is allowed to resolve to: facts/platforms/guides from the build, plus this turn's news. */
function knownCitationIds(builtAt: string, newsIds: readonly string[]): Set<string> {
  if (catalogIdCache?.builtAt !== builtAt) {
    catalogIdCache = { builtAt, ids: new Set(buildCatalog(getKnowledge()).map((e) => e.id)) };
  }
  return newsIds.length === 0 ? catalogIdCache.ids : new Set([...catalogIdCache.ids, ...newsIds]);
}

export const MAX_MESSAGE_CHARS = 500;
export const MAX_USER_TURNS = 30;
const HISTORY_MESSAGES = 8;

const BUDGET_MESSAGE =
  "This guide has reached its daily usage limit and will be back tomorrow. In the meantime, the key facts on this page and ipo.dangote.com have the essentials.";
const TURN_CAP_MESSAGE = "This conversation has reached its length limit. Please start a new chat.";
const ENGINE_ERROR_MESSAGE = "Something went wrong on our side. Please try again in a moment.";

export interface TurnArgs {
  visitorId: string;
  conversationId: string | null;
  message: string;
  now?: Date;
  signal?: AbortSignal;
}

async function resolveConversation(visitorId: string, requestedId: string | null): Promise<string> {
  const db = getDb();
  if (requestedId) {
    const [existing] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, requestedId), eq(conversations.visitorId, visitorId)))
      .limit(1);
    if (existing) return existing.id;
  }
  const [created] = await db.insert(conversations).values({ visitorId }).returning({ id: conversations.id });
  return created.id;
}

function errorInfo(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const status = (err as { status?: number }).status;
    return { name: err.name, status, message: err.message.slice(0, 200) };
  }
  return { message: String(err).slice(0, 200) };
}

/** Runs one user turn end to end and yields the events to stream to the browser. */
export async function* runTurn(args: TurnArgs): AsyncGenerator<ServerEvent, void, void> {
  const now = args.now ?? new Date();
  const db = getDb();
  const knowledge = getKnowledge();
  const { text: message, redactions, changed } = redactPii(args.message.trim());
  const phaseForCache = computePhase(knowledge.ipo, now);

  // Static cache, checked before the budget gate so a cached answer keeps working even during a
  // budget outage. Only for the first message of a brand-new conversation, since that is the
  // only time the UI's suggestion chips (the only thing that can produce an exact match) show.
  const cached = args.conversationId === null ? lookupFaq(message, phaseForCache.phase) : null;
  if (cached) {
    const conversationId = await resolveConversation(args.visitorId, null);
    const assistantId = crypto.randomUUID();
    await db.insert(messages).values({ conversationId, role: "user", content: message, meta: { redactions } });
    await db.insert(messages).values({
      id: assistantId,
      conversationId,
      role: "assistant",
      content: cached.answer,
      meta: { model: "faq-cache", cost_usd: 0, phase: phaseForCache.phase, outcome: "ok" },
    });
    await db.update(conversations).set({ updatedAt: now, turnCount: 1 }).where(eq(conversations.id, conversationId));
    await logEvent({
      visitorId: args.visitorId,
      sessionId: conversationId,
      type: "message_sent",
      props: { chars: message.length, turn: 1, pii_redacted: changed, redactions },
    });
    await logEvent({
      visitorId: args.visitorId,
      sessionId: conversationId,
      type: "answer_served",
      props: { model: "faq-cache", phase: phaseForCache.phase, cost_usd: 0, cache_hit: true },
    });
    yield { event: "meta", data: { conversationId, messageId: assistantId, phase: phaseForCache.phase, sources: cached.sources } };
    yield { event: "delta", data: { text: cached.answer } };
    yield { event: "done", data: { messageId: assistantId } };
    return;
  }

  const budget = await isOverBudget(now);
  if (budget.over) {
    await logEvent({ visitorId: args.visitorId, type: "budget_tripped", props: { spent: budget.spent, cap: budget.cap } });
    yield { event: "error", data: { code: "budget", message: BUDGET_MESSAGE } };
    return;
  }

  const conversationId = await resolveConversation(args.visitorId, args.conversationId);

  const [{ userTurns }] = await db
    .select({ userTurns: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.role, "user")));
  if (userTurns >= MAX_USER_TURNS) {
    yield { event: "error", data: { code: "turn_cap", message: TURN_CAP_MESSAGE } };
    return;
  }

  const history: ChatTurn[] = (
    await db
      .select({ role: messages.role, content: messages.content })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))
  ).slice(-HISTORY_MESSAGES);

  await db.insert(messages).values({ conversationId, role: "user", content: message, meta: { redactions } });
  await logEvent({
    visitorId: args.visitorId,
    sessionId: conversationId,
    type: "message_sent",
    props: { chars: message.length, turn: userTurns + 1, pii_redacted: changed, redactions },
  });

  const phase = phaseForCache;
  const news = await buildNewsContext(message, now, phase.phase === "OPEN");
  const assistantId = crypto.randomUUID();
  yield {
    event: "meta",
    data: { conversationId, messageId: assistantId, phase: phase.phase, sources: news?.entries ?? [] },
  };

  const started = performance.now();
  let firstTokenAt: number | null = null;
  let text = "";
  let usage = EMPTY_USAGE;
  let model = "";
  let stopReason: string | null = null;
  let outcome: "ok" | "error" | "aborted" = "aborted";
  let failure: unknown = null;

  try {
    const input = {
      history,
      userMessage: message,
      now,
      knowledge,
      news: news ? { text: news.text, note: news.note } : undefined,
      changeSignals: news?.changeSignals,
      signal: args.signal,
    };
    for await (const ev of getEngine().stream(input)) {
      if (ev.type === "delta") {
        firstTokenAt ??= performance.now();
        text += ev.text;
        yield { event: "delta", data: { text: ev.text } };
      } else {
        usage = ev.usage;
        model = ev.model;
        stopReason = ev.stopReason;
      }
    }
    outcome = "ok";
  } catch (err) {
    outcome = args.signal?.aborted ? "aborted" : "error";
    failure = err;
  } finally {
    // Runs on success, failure and browser disconnect alike, so nothing is lost when a user closes the tab.
    const latencyMs = Math.round(performance.now() - started);
    const ttftMs = firstTokenAt === null ? null : Math.round(firstTokenAt - started);
    const cost = costUsd(usage, model);
    const grounding = analyzeGrounding(text, knownCitationIds(knowledge.builtAt, (news?.entries ?? []).map((e) => e.id)));
    if (text) {
      await db.insert(messages).values({
        id: assistantId,
        conversationId,
        role: "assistant",
        content: text,
        meta: {
          model,
          stopReason,
          usage,
          cost_usd: cost,
          latencyMs,
          ttftMs,
          phase: phase.phase,
          outcome,
          citations: grounding.citations,
          unknown_citations: grounding.unknownCitations,
          unbacked_numeric_claim: grounding.unbackedNumericClaim,
        },
      });
    }
    await db
      .update(conversations)
      .set({ updatedAt: new Date(), turnCount: userTurns + 1 })
      .where(eq(conversations.id, conversationId));
    await logEvent({
      visitorId: args.visitorId,
      sessionId: conversationId,
      type: outcome === "ok" ? "answer_served" : outcome === "aborted" ? "answer_aborted" : "error",
      props: {
        model,
        phase: phase.phase,
        stop_reason: stopReason,
        latency_ms: latencyMs,
        ttft_ms: ttftMs,
        cost_usd: cost,
        citations: grounding.citations,
        unknown_citations: grounding.unknownCitations,
        unbacked_numeric_claim: grounding.unbackedNumericClaim,
        ...usage,
        ...(failure ? errorInfo(failure) : {}),
      },
    });
  }

  if (outcome === "ok") {
    yield { event: "done", data: { messageId: assistantId } };
  } else if (outcome === "error") {
    yield { event: "error", data: { code: "engine", message: ENGINE_ERROR_MESSAGE } };
  }
}
