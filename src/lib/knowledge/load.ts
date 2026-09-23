import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  GuideSchema,
  IpoFactsSchema,
  KnowledgeSchema,
  PlatformsFileSchema,
  type Guide,
  type Knowledge,
} from "./schema";

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function readText(file: string): string {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function readYaml(file: string): unknown {
  return YAML.parse(readText(file));
}

function readGuide(file: string, id: string): Guide {
  const match = FRONT_MATTER.exec(readText(file));
  if (!match) throw new Error(`${file}: missing front matter`);
  const meta = YAML.parse(match[1]) as { title?: string; reviewed?: boolean };
  return GuideSchema.parse({
    id,
    title: meta.title,
    reviewed: meta.reviewed ?? false,
    body: match[2].trim(),
  });
}

export function loadKnowledge(root: string = process.cwd(), builtAt: string = new Date().toISOString()): Knowledge {
  const dir = path.join(root, "facts");
  const evergreenDir = path.join(dir, "evergreen");
  const guides = fs
    .readdirSync(evergreenDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => readGuide(path.join(evergreenDir, f), f.replace(/\.md$/, "")));

  return KnowledgeSchema.parse({
    builtAt,
    ipo: IpoFactsSchema.parse(readYaml(path.join(dir, "ipo.yaml"))),
    platforms: PlatformsFileSchema.parse(readYaml(path.join(dir, "platforms.yaml"))),
    guides,
    eusate: readGuide(path.join(dir, "eusate.md"), "eusate"),
  });
}
