import fs from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  // Local runs read .env.local; variables already set (CI, or an explicit override) win.
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const target = new URL(url);
  console.log(`migrating ${target.hostname}:${target.port || "5432"}${target.pathname}`);

  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    console.log("migrations applied");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
