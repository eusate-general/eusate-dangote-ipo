import fs from "node:fs";
import { getDb } from "../src/lib/db/client";
import { buildDigestMetrics, formatDigest } from "../src/lib/digest/build";
import { notify } from "../src/lib/notify";

async function main() {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
  getDb();

  const now = new Date();
  const metrics = await buildDigestMetrics(now);
  const { title, body } = formatDigest(metrics);

  console.log(title);
  console.log(body);

  const result = await notify({
    key: `digest:${metrics.dayLabel}`,
    kind: "daily_digest",
    severity: "info", // email only, never Telegram - a digest is not urgent
    title,
    body,
    cooldownMinutes: 20 * 60, // one per day, with room for a manual re-run to not duplicate
  });
  console.log(`notify: ${result}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
