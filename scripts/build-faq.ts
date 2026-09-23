import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "src", "generated", "faq.json");

interface CachedFile {
  contentHash: string;
  phase: string | null;
  entries: unknown[];
}

function writeEmpty(reason: string): void {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ contentHash: "", phase: null, entries: [] }, null, 2));
  console.log(`faq: ${reason}, wrote an empty cache (every question falls through to the live model)`);
}

async function main() {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

  // Checked directly (not via getEnv()) so this can bail out before requiring DATABASE_URL or
  // any other config to be present — a fresh checkout with no .env.local must still build.
  if (!process.env.ANTHROPIC_API_KEY && process.env.ANSWER_MODE !== "mock") {
    writeEmpty("no ANTHROPIC_API_KEY and ANSWER_MODE is not mock");
    return;
  }

  const { buildCatalog, CITATION_PATTERN } = await import("../src/lib/catalog");
  const { getEngine } = await import("../src/lib/engine");
  const { loadKnowledge } = await import("../src/lib/knowledge/load");
  const { computePhase, SUGGESTED_QUESTIONS } = await import("../src/lib/phase");

  // A fixed builtAt: loadKnowledge()'s default is "now", which would make every load look like
  // new content. Only facts/platforms/guides/eusate feed the FAQ answers, so only those are hashed.
  const knowledge = loadKnowledge(process.cwd(), "");
  const contentHash = crypto.createHash("sha256").update(JSON.stringify({ ...knowledge, builtAt: undefined })).digest("hex");
  const now = new Date();
  const phase = computePhase(knowledge.ipo, now).phase;
  const questions = [...new Set(SUGGESTED_QUESTIONS[phase])];

  // Regeneration is a real LLM cost, so skip it when nothing that could change the answers has:
  // same facts content and same phase as what is already cached.
  if (fs.existsSync(OUT)) {
    const existing = JSON.parse(fs.readFileSync(OUT, "utf8")) as CachedFile;
    if (existing.contentHash === contentHash && existing.phase === phase && existing.entries.length === questions.length) {
      console.log(`faq: cache already current for phase ${phase} (${questions.length} questions), skipping`);
      return;
    }
  }

  const catalog = buildCatalog(knowledge);
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const engine = getEngine();

  const entries = [];
  for (const question of questions) {
    let answer = "";
    for await (const ev of engine.stream({ history: [], userMessage: question, now, knowledge })) {
      if (ev.type === "delta") answer += ev.text;
    }
    const seen = new Set<string>();
    const sources = [];
    for (const m of answer.matchAll(CITATION_PATTERN)) {
      const entry = byId.get(m[1]);
      if (entry && !seen.has(entry.id)) {
        seen.add(entry.id);
        sources.push(entry);
      }
    }
    entries.push({ question, answer, sources });
    console.log(`  generated: ${question}`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ contentHash, phase, entries }, null, 2));
  console.log(`faq: generated ${entries.length} cached answers for phase ${phase} -> ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
