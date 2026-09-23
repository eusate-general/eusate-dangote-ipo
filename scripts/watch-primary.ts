import fs from "node:fs";
import { getDb } from "../src/lib/db/client";
import { renderWithPlaywright } from "../src/lib/watch/render";
import { runWatch } from "../src/lib/watch/run";

async function main() {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
  getDb(); // fail fast on a missing DATABASE_URL

  const summary = await runWatch({ render: renderWithPlaywright });

  for (const r of summary.results) {
    if (!r.ok) console.log(`  FAIL ${r.id}: ${r.error}`);
    else console.log(`  ok   ${r.id}${r.isFirstCheck ? " (first check, baseline saved)" : r.changed ? " CHANGED" : " unchanged"}`);
  }
  console.log(`watch-primary ${summary.ok ? "ok" : "FAILED"}: ${summary.changedCount} page(s) changed`);
  process.exit(summary.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
