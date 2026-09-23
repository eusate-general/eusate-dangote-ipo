import type { FactStatus, Knowledge } from "@/lib/knowledge/schema";

export type SourceKind = "fact" | "platform" | "guide" | "eusate" | "news";

/** Something the bot may cite with a [[id]] marker, and the UI can render as a source chip. */
export interface SourceEntry {
  id: string;
  kind: SourceKind;
  title: string;
  url?: string;
  /** "confirmed" | "reported" for facts; listing status for platforms. */
  status?: string;
  verifiedAt?: string | null;
}

export const EUSATE_URL = "https://eusate.com";

/** Matches [[fact:offer]], [[platform:bamboo]], [[guide:ipo-basics]], [[eusate]]. */
export const CITATION_PATTERN = /\[\[([a-z]+(?::[a-z0-9_-]+)?)\]\]/g;

function weakest(...items: { status: FactStatus }[]): FactStatus {
  return items.some((i) => i.status === "reported") ? "reported" : "confirmed";
}

export function buildCatalog(k: Knowledge): SourceEntry[] {
  const { offer, timeline } = k.ipo;
  const entries: SourceEntry[] = [
    {
      id: "fact:offer",
      kind: "fact",
      title: "Offer terms",
      url: offer.sources[0].url,
      status: offer.status,
      verifiedAt: offer.verified_at,
    },
    {
      id: "fact:timeline",
      kind: "fact",
      title: "Offer timeline",
      url: timeline.closes.sources[0].url,
      status: weakest(timeline.opens, timeline.closes),
      verifiedAt: timeline.closes.verified_at,
    },
  ];

  for (const fact of k.ipo.facts) {
    entries.push({
      id: `fact:${fact.id}`,
      kind: "fact",
      title: fact.label,
      url: fact.sources[0].url,
      status: fact.status,
      verifiedAt: fact.verified_at,
    });
  }
  for (const p of k.platforms.platforms) {
    entries.push({
      id: `platform:${p.id}`,
      kind: "platform",
      title: p.name,
      url: p.howto_url,
      status: p.listing_status,
      verifiedAt: p.verified_at ?? null,
    });
  }
  for (const g of k.guides) {
    entries.push({ id: `guide:${g.id}`, kind: "guide", title: g.title });
  }
  entries.push({ id: "eusate", kind: "eusate", title: k.eusate.title, url: EUSATE_URL });
  return entries;
}

/** Numbers each distinct valid citation in order of first appearance and rewrites it as a markdown link. */
export function linkifyCitations(
  text: string,
  byId: ReadonlyMap<string, SourceEntry>,
): { markdown: string; cited: SourceEntry[] } {
  const cited: SourceEntry[] = [];
  const index = new Map<string, number>();

  // Hide a marker that is still streaming in (e.g. "[[fact:of").
  const complete = text.replace(/\[\[[^\]]*$/, "");
  const markdown = complete.replace(CITATION_PATTERN, (_m, id: string) => {
    const entry = byId.get(id);
    if (!entry) return "";
    let n = index.get(id);
    if (n === undefined) {
      cited.push(entry);
      n = cited.length;
      index.set(id, n);
    }
    return `[${n}](#cite-${n})`;
  });
  return { markdown, cited };
}
