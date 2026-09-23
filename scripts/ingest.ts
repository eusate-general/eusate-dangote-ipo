import fs from "node:fs";
import { getDb } from "../src/lib/db/client";
import { loadKnowledge } from "../src/lib/knowledge/load";
import { buildBaseline } from "../src/lib/news/baseline";
import { HaikuEnricher } from "../src/lib/news/enrich";
import { runIngest } from "../src/lib/news/ingest";

async function main() {
  // Local runs read .env.local; in CI the variables come from secrets.
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  getDb(); // fail fast on a missing DATABASE_URL

  const summary = await runIngest({
    enricher: new HaikuEnricher(apiKey, process.env.ENRICH_MODEL ?? "claude-haiku-4-5"),
    baseline: buildBaseline(loadKnowledge()),
  });

  console.log(
    `ingest ${summary.ok ? "ok" : "FAILED"}: ${summary.sourcesTotal - summary.sourcesFailed}/${summary.sourcesTotal} sources, ` +
      `${summary.fetched} fetched, ${summary.newItems} new, ${summary.relevantItems} relevant, ` +
      `summarised ${summary.enrichedOk} ok / ${summary.enrichedFailed} failed, cost $${summary.enrichCostUsd.toFixed(4)}`,
  );
  for (const s of summary.perSource) {
    console.log(`  ${s.ok ? "ok  " : "FAIL"} ${s.id}${s.ok ? ` (${s.kept}/${s.items} kept)` : `: ${s.error}`}`);
  }
  for (const sig of summary.signals) {
    console.log(
      `  signal ${sig.type} by ${sig.sources.join(", ")}${sig.independent ? "" : " (single source)"}${sig.botVisible ? " [bot-visible]" : ""}: ${sig.claim}`,
    );
  }
  process.exit(summary.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
