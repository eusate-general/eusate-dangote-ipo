CREATE TABLE "alerts" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"source_name" text NOT NULL,
	"url" text NOT NULL,
	"canonical_url" text NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"enrich_attempts" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"event_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"claim" text,
	"cluster_id" uuid,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, ''))) STORED,
	CONSTRAINT "articles_canonical_url_unique" UNIQUE("canonical_url")
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"ok" boolean NOT NULL,
	"sources_total" integer NOT NULL,
	"sources_failed" integer NOT NULL,
	"fetched" integer NOT NULL,
	"new_items" integer NOT NULL,
	"relevant_items" integer NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "articles_published_idx" ON "articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "articles_status_published_idx" ON "articles" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "articles_cluster_idx" ON "articles" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "articles_tsv_idx" ON "articles" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "ingest_runs_finished_idx" ON "ingest_runs" USING btree ("finished_at");