import { z } from "zod";

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  ANSWER_MODEL: z.string().default("claude-sonnet-5"),
  ANSWER_MODE: z.enum(["live", "mock"]).default("live"),
  ANSWER_EFFORT: z.enum(["low", "medium", "high"]).default("low"),
  DATABASE_URL: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().positive().default(5),
  DAILY_BUDGET_USD: z.coerce.number().positive().default(50),
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  LEAD_WEBHOOK_URL: z.string().optional(),
  // Signs the "bot-check passed" cookie. Any long random string; rotating it re-challenges everyone once.
  SESSION_SECRET: z.string().min(16).default("dev-only-insecure-secret-change-me-before-launch"),
});
export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parsed lazily so `next build` does not need runtime secrets. */
export function getEnv(): Env {
  cached ??= EnvSchema.parse(process.env);
  return cached;
}
