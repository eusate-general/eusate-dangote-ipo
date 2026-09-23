import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    visitorId: text("visitor_id").notNull(),
    sessionId: text("session_id"),
    type: text("type").notNull(),
    props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index("events_ts_idx").on(t.ts),
    index("events_type_ts_idx").on(t.type, t.ts),
    index("events_visitor_ts_idx").on(t.visitorId, t.ts),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitorId: text("visitor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    turnCount: integer("turn_count").notNull().default(0),
  },
  (t) => [index("conversations_visitor_idx").on(t.visitorId, t.createdAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    // Redacted text only. Raw user input is never stored.
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export type ArticleStatus = "pending" | "relevant" | "irrelevant" | "failed";

/** News about the IPO. We keep headline, link, our own short summary, and metadata, not publisher text. */
export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url").notNull().unique(),
    title: text("title").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").$type<ArticleStatus>().notNull().default("pending"),
    enrichAttempts: integer("enrich_attempts").notNull().default(0),
    summary: text("summary"),
    eventTypes: text("event_types").array().notNull().default(sql`'{}'::text[]`),
    claim: text("claim"),
    clusterId: uuid("cluster_id"),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, ''))`,
    ),
  },
  (t) => [
    index("articles_published_idx").on(t.publishedAt),
    index("articles_status_published_idx").on(t.status, t.publishedAt),
    index("articles_cluster_idx").on(t.clusterId),
    index("articles_tsv_idx").using("gin", t.tsv),
  ],
);

export interface IngestSourceResult {
  id: string;
  ok: boolean;
  items?: number;
  kept?: number;
  error?: string;
}

export const ingestRuns = pgTable(
  "ingest_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    ok: boolean("ok").notNull(),
    sourcesTotal: integer("sources_total").notNull(),
    sourcesFailed: integer("sources_failed").notNull(),
    fetched: integer("fetched").notNull(),
    newItems: integer("new_items").notNull(),
    relevantItems: integer("relevant_items").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("ingest_runs_finished_idx").on(t.finishedAt)],
);

/**
 * Fixed-window rate-limit counters. One row per active (key, window); Postgres over Redis because
 * we already run Postgres everywhere and traffic here is nowhere near where that would matter.
 * `window_start` lets a stale row be told apart from a fresh window without a separate expiry job;
 * the retention job sweeps rows whose window has long passed.
 */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [index("rate_limit_buckets_window_idx").on(t.windowStart)],
);

/**
 * One row per official-site page the primary-source watcher checks. `contentHash` is a hash of
 * the rendered, normalized page text; a changed hash is what triggers an owner alert. This never
 * writes to facts/ — a human still decides whether and how to update them (see PLAN.md section 5).
 */
export const sourceChecks = pgTable("source_checks", {
  url: text("url").primaryKey(),
  contentHash: text("content_hash"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
});

/** Eusate brand leads, captured with explicit consent (PLAN.md section 8). */
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  visitorId: text("visitor_id").notNull(),
  context: text("context").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  webhookSentAt: timestamp("webhook_sent_at", { withTimezone: true }),
  webhookError: text("webhook_error"),
});

/** Owner alerts, deduplicated by key with a cooldown so a flapping problem does not spam. */
export const alerts = pgTable("alerts", {
  key: text("key").primaryKey(),
  kind: text("kind").notNull(),
  severity: text("severity").$type<"info" | "warn" | "critical">().notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  firstAt: timestamp("first_at", { withTimezone: true }).notNull().defaultNow(),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull().defaultNow(),
  count: integer("count").notNull().default(1),
});
