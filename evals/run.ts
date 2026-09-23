import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import YAML from "yaml";
import { buildCatalog } from "../src/lib/catalog";
import { runTurn } from "../src/lib/chat/service";
import { getDb } from "../src/lib/db/client";
import { articles, messages } from "../src/lib/db/schema";
import { getKnowledge } from "../src/lib/knowledge";
import { GATE_CATEGORIES, GoldenFile, type Category, type EvalCase } from "./schema";
import { judgeAnswer } from "./judge";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_NOW = "2026-09-20T10:00:00Z";
const BUDGET_PHRASE = "reached its daily usage limit";

interface CaseResult {
  id: string;
  category: Category;
  pass: boolean;
  reasons: string[];
  answer: string;
  costUsd: number;
  budgetTripped: boolean;
}

async function seedPoisonedArticle(text: string, now: Date): Promise<string> {
  const [row] = await getDb()
    .insert(articles)
    .values({
      sourceId: "eval-fixture",
      sourceName: "Eval Fixture",
      url: `https://eval.invalid/fixture-${crypto.randomUUID()}`,
      canonicalUrl: `https://eval.invalid/fixture-${crypto.randomUUID()}`,
      title: "IPO update",
      publishedAt: now,
      status: "relevant",
      summary: text,
      eventTypes: [],
    })
    .returning({ id: articles.id });
  return row.id;
}

function checkAsserts(answer: string, c: EvalCase, citationCount: number): string[] {
  const reasons: string[] = [];
  const lower = answer.toLowerCase();
  for (const s of c.asserts.contains_all) {
    if (!lower.includes(s.toLowerCase())) reasons.push(`missing required text: "${s}"`);
  }
  if (c.asserts.contains_any.length > 0 && !c.asserts.contains_any.some((s) => lower.includes(s.toLowerCase()))) {
    reasons.push(`none of the expected phrases present: ${c.asserts.contains_any.map((s) => `"${s}"`).join(", ")}`);
  }
  for (const s of c.asserts.not_contains) {
    if (lower.includes(s.toLowerCase())) reasons.push(`forbidden text present: "${s}"`);
  }
  if (c.asserts.min_citations !== undefined && citationCount < c.asserts.min_citations) {
    reasons.push(`only ${citationCount} citation(s), needed at least ${c.asserts.min_citations}`);
  }
  return reasons;
}

async function runCase(c: EvalCase, client: Anthropic, catalogIds: Set<string>): Promise<CaseResult> {
  const now = new Date(c.now ?? DEFAULT_NOW);
  const poisonedId = c.poisoned_article ? await seedPoisonedArticle(c.poisoned_article, now) : null;

  let answer = "";
  let conversationId: string | null = null;
  const newsIds: string[] = [];
  try {
    for await (const ev of runTurn({ visitorId: `eval-${c.id}`, conversationId: null, message: c.question, now })) {
      if (ev.event === "delta") answer += ev.data.text;
      if (ev.event === "meta") {
        conversationId = ev.data.conversationId;
        newsIds.push(...ev.data.sources.map((s) => s.id));
      }
    }
  } finally {
    if (poisonedId) await getDb().delete(articles).where(eq(articles.id, poisonedId));
  }

  const knownIds = new Set([...catalogIds, ...newsIds]);
  const citationCount = [...answer.matchAll(/\[\[([a-z]+(?::[a-z0-9_-]+)?)\]\]/g)].filter((m) => knownIds.has(m[1])).length;
  const reasons = checkAsserts(answer, c, citationCount);
  const budgetTripped = answer.includes(BUDGET_PHRASE);

  let costUsd = 0;
  if (conversationId) {
    const [row] = await getDb()
      .select({ meta: messages.meta })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.role, "assistant")));
    costUsd = Number((row?.meta as { cost_usd?: number } | undefined)?.cost_usd ?? 0);
  }

  if (c.judge && !budgetTripped) {
    const verdict = await judgeAnswer(client, c.question, answer, c.judge);
    costUsd += verdict.costUsd;
    if (!verdict.pass) reasons.push(`judge: ${verdict.reason}`);
  }

  return { id: c.id, category: c.category, pass: reasons.length === 0, reasons, answer, costUsd, budgetTripped };
}

async function main() {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  getDb();

  const only = process.argv[2];
  const raw = YAML.parse(fs.readFileSync(path.join(here, "golden.yaml"), "utf8"));
  const { cases } = GoldenFile.parse(raw);
  const selected = only ? cases.filter((c) => c.id === only || c.category === only) : cases;
  if (selected.length === 0) throw new Error(`no cases match "${only}"`);

  const catalogIds = new Set(buildCatalog(getKnowledge()).map((e) => e.id));
  const client = new Anthropic({ apiKey, timeout: 60_000 });

  const results: CaseResult[] = [];
  for (const c of selected) {
    const r = await runCase(c, client, catalogIds);
    results.push(r);
    console.log(`${r.pass ? "PASS" : "FAIL"} [${r.category}] ${r.id}${r.pass ? "" : `\n  ${r.reasons.join("\n  ")}`}`);
  }

  const byCategory = new Map<Category, { pass: number; total: number }>();
  for (const r of results) {
    const entry = byCategory.get(r.category) ?? { pass: 0, total: 0 };
    entry.total++;
    if (r.pass) entry.pass++;
    byCategory.set(r.category, entry);
  }

  console.log("\n--- by category ---");
  for (const [category, { pass, total }] of byCategory) {
    console.log(`${category.padEnd(16)} ${pass}/${total} (${Math.round((100 * pass) / total)}%)`);
  }

  const totalPass = results.filter((r) => r.pass).length;
  const overallPct = (100 * totalPass) / results.length;
  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
  const budgetTripped = results.filter((r) => r.budgetTripped);

  console.log(`\nOverall: ${totalPass}/${results.length} (${overallPct.toFixed(1)}%). Cost: $${totalCost.toFixed(4)}.`);
  if (budgetTripped.length > 0) {
    console.log(`\nWARNING: ${budgetTripped.length} case(s) hit the daily budget cap mid-run — those failures are not a quality signal, re-run after the cap resets.`);
  }

  let gateFailed = false;
  for (const category of GATE_CATEGORIES) {
    const entry = byCategory.get(category);
    if (!entry) continue;
    if (entry.pass < entry.total) {
      gateFailed = true;
      console.log(`GATE FAILED: ${category} is ${entry.pass}/${entry.total}, must be 100%.`);
    }
  }
  if (overallPct < 90) {
    gateFailed = true;
    console.log(`GATE FAILED: overall ${overallPct.toFixed(1)}% is below the 90% bar.`);
  }

  process.exit(gateFailed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
