import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export interface ReviewItem {
  messageId: string;
  question: string;
  answer: string;
  createdAt: string;
  reason: string;
}

export interface FeedbackItem {
  messageId: string | null;
  question: string | null;
  answer: string | null;
  createdAt: string;
  value: string;
}

const LIMIT = 30;

/** Recent answers that stated a figure with no citation, or cited something that did not resolve. */
export async function getFlaggedAnswers(): Promise<ReviewItem[]> {
  const rows = await getDb().execute<{
    id: string;
    content: string;
    created_at: string;
    unbacked: boolean;
    unknown: number;
    question: string | null;
  }>(sql`
    select m.id, m.content, m.created_at,
      coalesce((m.meta->>'unbacked_numeric_claim')::boolean, false) as unbacked,
      coalesce((m.meta->>'unknown_citations')::int, 0) as unknown,
      (
        select content from messages
        where conversation_id = m.conversation_id and role = 'user' and created_at <= m.created_at
        order by created_at desc limit 1
      ) as question
    from messages m
    where m.role = 'assistant'
      and (coalesce((m.meta->>'unbacked_numeric_claim')::boolean, false) or coalesce((m.meta->>'unknown_citations')::int, 0) > 0)
    order by m.created_at desc
    limit ${LIMIT}
  `);
  return rows.map((r) => ({
    messageId: r.id,
    question: r.question ?? "(no question found)",
    answer: r.content,
    createdAt: r.created_at,
    reason: [r.unbacked ? "states a figure with no citation" : null, r.unknown > 0 ? `${r.unknown} unresolved citation marker(s)` : null]
      .filter(Boolean)
      .join("; "),
  }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Recent 👎 feedback, joined back to the actual question and answer where still available.
 * `messageId` comes from a client POST to /api/track — arbitrary text within the schema's length
 * limit, not guaranteed to be a real UUID — so the join happens in JS, never as a SQL `::uuid`
 * cast (one malformed value would otherwise throw and break the whole query).
 */
export async function getRecentDownvotes(): Promise<FeedbackItem[]> {
  const feedbackRows = await getDb().execute<{ message_id: string | null; ts: string }>(sql`
    select props->>'messageId' as message_id, ts from events
    where type = 'feedback' and props->>'value' = 'down'
    order by ts desc
    limit ${LIMIT}
  `);

  const ids = [...new Set(feedbackRows.map((r) => r.message_id).filter((id): id is string => id !== null && UUID.test(id)))];
  const messageRows =
    ids.length === 0
      ? []
      : await getDb().execute<{ id: string; content: string; conversation_id: string; created_at: string }>(sql`
          select id, content, conversation_id, created_at from messages
          where id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}) and role = 'assistant'
        `);
  const byId = new Map(messageRows.map((m) => [m.id, m]));

  const questionRows =
    messageRows.length === 0
      ? []
      : await getDb().execute<{ conversation_id: string; content: string; created_at: string }>(sql`
          select distinct on (conversation_id) conversation_id, content, created_at from messages
          where conversation_id in (${sql.join(messageRows.map((m) => sql`${m.conversation_id}::uuid`), sql`, `)}) and role = 'user'
          order by conversation_id, created_at desc
        `);
  // Approximate: the conversation's latest user message, not necessarily the exact turn the
  // downvote was about (only matters for a multi-turn conversation with more than one downvote).
  // Fine for an internal review list; PLAN.md's grounding note applies the same "coarse proxy" idea.
  const questionByConversation = new Map(questionRows.map((q) => [q.conversation_id, q.content]));

  return feedbackRows.map((r) => {
    const message = r.message_id ? byId.get(r.message_id) : undefined;
    return {
      messageId: r.message_id,
      question: message ? (questionByConversation.get(message.conversation_id) ?? null) : null,
      answer: message?.content ?? null,
      createdAt: r.ts,
      value: "down",
    };
  });
}
