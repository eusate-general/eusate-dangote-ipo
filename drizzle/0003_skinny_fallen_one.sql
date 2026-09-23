CREATE TABLE "source_checks" (
	"url" text PRIMARY KEY NOT NULL,
	"content_hash" text,
	"last_checked_at" timestamp with time zone,
	"last_changed_at" timestamp with time zone
);
