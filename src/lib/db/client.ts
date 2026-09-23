import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: Db; __sql?: ReturnType<typeof postgres> };

export function getDb(): Db {
  if (!globalForDb.__db) {
    const env = getEnv();
    // prepare:false keeps this compatible with pooled (pgbouncer) connection strings.
    globalForDb.__sql = postgres(env.DATABASE_URL, { max: env.DB_POOL_MAX, prepare: false, idle_timeout: 20 });
    globalForDb.__db = drizzle(globalForDb.__sql, { schema });
  }
  return globalForDb.__db;
}
