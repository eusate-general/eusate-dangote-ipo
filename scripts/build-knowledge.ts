import fs from "node:fs";
import path from "node:path";
import { loadKnowledge } from "../src/lib/knowledge/load";

// Fails the build on invalid facts, so a broken facts file can never deploy.
const knowledge = loadKnowledge();
const out = path.join(process.cwd(), "src", "generated", "knowledge.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(knowledge, null, 2));
console.log(
  `knowledge: ${knowledge.platforms.platforms.length} platforms, ${knowledge.guides.length} guides, ` +
    `${knowledge.ipo.facts.length} facts -> ${path.relative(process.cwd(), out)}`,
);
