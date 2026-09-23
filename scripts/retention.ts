import fs from "node:fs";
import { and, lt, notInArray } from "drizzle-orm";
import { getDb } from "../src/lib/db/client";
import { conversations, messages, rateLimitBuckets } from "../src/lib/db/schema";

const RAW_MESSAGE_RETENTION_DAYS = 30;
// Aggregate metrics (the `events` table) carry no raw chat content — logEvent never stores it,
// only counts and redaction flags — so they are not covered by the 30-day raw-content policy.
const RATE_LIMIT_BUCKET_RETENTION_HOURS = 6;

async function main() {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
  const db = getDb();
  const now = new Date();

  const messageCutoff = new Date(now.getTime() - RAW_MESSAGE_RETENTION_DAYS * 86_400_000);
  const deletedMessages = await db.delete(messages).where(lt(messages.createdAt, messageCutoff)).returning({ id: messages.id });

  // A conversation with no messages left (all aged out) carries nothing to retain either.
  const deletedConversations = await db
    .delete(conversations)
    .where(
      and(
        lt(conversations.updatedAt, messageCutoff),
        notInArray(conversations.id, db.selectDistinct({ id: messages.conversationId }).from(messages)),
      ),
    )
    .returning({ id: conversations.id });

  const bucketCutoff = new Date(now.getTime() - RATE_LIMIT_BUCKET_RETENTION_HOURS * 3_600_000);
  const deletedBuckets = await db
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.windowStart, bucketCutoff))
    .returning({ key: rateLimitBuckets.key });

  console.log(
    `retention: deleted ${deletedMessages.length} messages older than ${RAW_MESSAGE_RETENTION_DAYS}d, ` +
      `${deletedConversations.length} now-empty conversations, ${deletedBuckets.length} stale rate-limit buckets`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
