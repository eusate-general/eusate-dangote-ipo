import type { SourceEntry } from "@/lib/catalog";
import { formatDate, watDate } from "@/lib/time";
import { STOPWORDS } from "./cluster";
import { signalText } from "./signals";
import { getChangeSignals, getIngestStatus, getLatestNews, staleAfterMinutes, type NewsItem } from "./store";

export interface NewsContext {
  /** Formatted headlines for the prompt, or null when there are none. */
  text: string | null;
  /** Something the bot should know about the feed itself (stale, empty). */
  note: string | null;
  /** Source chips for the UI, so [[news:...]] markers resolve. */
  entries: SourceEntry[];
  /** Independent reports of a change to dates, terms or platforms. */
  changeSignals: string[];
}

const MAX_ITEMS = 8;
const MAX_CHARS = 3000;

// Every relevant article already contains these, so they say nothing about which story a question wants.
const SEARCH_STOPWORDS = new Set([
  ...STOPWORDS,
  "dangote", "refinery", "ipo", "share", "shares", "offer", "please", "tell", "about", "know", "need", "want", "can",
  "could", "should", "would", "does", "did", "have", "has", "get", "any", "there", "more", "latest", "news", "today",
  "now", "just", "really", "also", "much", "many", "some", "which", "where", "who",
]);

/** A safe "a | b | c" tsquery from a chat message: letters and digits only, so it cannot be malformed. */
export function orQuery(message: string): string | null {
  const words = message.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const unique = [...new Set(words.filter((w) => !SEARCH_STOPWORDS.has(w)))].slice(0, 8);
  return unique.length > 0 ? unique.join(" | ") : null;
}

export function humanAge(minutes: number): string {
  if (minutes < 90) return `${minutes} minutes`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} hours`;
  return `${Math.round(minutes / 1440)} days`;
}

export function formatNewsLine(item: NewsItem): string {
  const summary = item.summary ? ` (${item.summary})` : "";
  return `[[news:${item.id.slice(0, 8)}]] ${formatDate(watDate(item.publishedAt))}, ${item.source}: ${item.title}${summary}`;
}

/**
 * News for one chat turn: the newest stories, plus any that match the question. Returns null if the news
 * tables cannot be read, so a news problem never breaks chat.
 */
export async function buildNewsContext(message: string, now: Date, isOpen: boolean): Promise<NewsContext | null> {
  try {
    const query = orQuery(message);
    const [latest, hits, status, { signals }] = await Promise.all([
      getLatestNews({ limit: 6, days: 7, now }),
      query ? getLatestNews({ limit: 4, days: 30, now, search: { kind: "or", text: query } }) : Promise.resolve([]),
      getIngestStatus(now),
      getChangeSignals(now),
    ]);

    const seen = new Set<string>();
    const items: NewsItem[] = [];
    for (const item of [...hits, ...latest]) {
      if (seen.has(item.id) || items.length >= MAX_ITEMS) continue;
      seen.add(item.id);
      items.push(item);
    }
    items.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

    const lines: string[] = [];
    let used = 0;
    for (const item of items) {
      const line = formatNewsLine(item);
      if (used + line.length > MAX_CHARS) break;
      lines.push(line);
      used += line.length;
    }

    const notes: string[] = [];
    const stale = status.lastOkAt === null || (status.ageMinutes ?? 0) > staleAfterMinutes(isOpen);
    if (stale) {
      notes.push(
        `${status.lastOkAt === null ? "the news feed has not run yet" : `the news feed last updated ${humanAge(status.ageMinutes ?? 0)} ago`}, so the newest developments may be missing. Say so if asked about the latest news`,
      );
    }
    if (lines.length === 0) notes.push("no recent relevant news items were found. Do not claim to have the latest news");

    return {
      text: lines.length > 0 ? lines.join("\n") : null,
      note: notes.length > 0 ? notes.join("; ") : null,
      entries: items.slice(0, lines.length).map((i) => ({
        id: `news:${i.id.slice(0, 8)}`,
        kind: "news" as const,
        title: `${i.title} (${i.source})`,
        url: i.url,
      })),
      changeSignals: signals.filter((s) => s.botVisible).slice(0, 3).map(signalText),
    };
  } catch (err) {
    console.error("news context unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}
