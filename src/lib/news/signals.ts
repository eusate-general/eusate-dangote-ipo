export type ChangeType = "TIMELINE_CHANGE" | "PRICE_CHANGE" | "PLATFORM_CHANGE";
export const CHANGE_TYPES: readonly ChangeType[] = ["TIMELINE_CHANGE", "PRICE_CHANGE", "PLATFORM_CHANGE"];

export interface SignalArticle {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url?: string;
  publishedAt: Date;
  eventTypes: string[];
  claim: string | null;
}

/**
 * Only changes to the terms themselves can make our answers wrong, so only those are shown to the bot.
 * Platform additions are directory news: they reach the owner as an info alert and the news feed.
 */
export const BOT_VISIBLE_TYPES: readonly ChangeType[] = ["TIMELINE_CHANGE", "PRICE_CHANGE"];

export interface ChangeSignal {
  type: ChangeType;
  sources: string[];
  /** The newest report's claim. */
  claim: string;
  /** Every distinct claim (newest first, at most three), for the owner. */
  claims: string[];
  latestAt: Date;
  articleIds: string[];
  /** Two or more different outlets. */
  independent: boolean;
  /** Independent and about the terms themselves. Only these are mentioned by the bot. */
  botVisible: boolean;
}

const LABEL: Record<ChangeType, string> = {
  TIMELINE_CHANGE: "Change to the offer timeline reported",
  PRICE_CHANGE: "Change to the offer price or terms reported",
  PLATFORM_CHANGE: "Change to the approved platforms reported",
};

/**
 * Looks for reports of a change (extension, early close, new terms, platform changes) in recent articles.
 * It never edits facts: the result goes to the owner as an alert and to the bot as a hedged note.
 */
export function detectSignals(articles: SignalArticle[], now: Date, windowHours = 48): ChangeSignal[] {
  const cutoff = now.getTime() - windowHours * 3_600_000;
  const signals: ChangeSignal[] = [];

  for (const type of CHANGE_TYPES) {
    const matching = articles
      .filter((a) => a.publishedAt.getTime() >= cutoff && a.eventTypes.includes(type))
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    if (matching.length === 0) continue;

    const sources = [...new Set(matching.map((a) => a.sourceName))];
    const newest = matching[0];
    const independent = sources.length >= 2;
    signals.push({
      type,
      sources,
      claim: newest.claim ?? newest.title,
      claims: [...new Set(matching.map((a) => a.claim ?? a.title))].slice(0, 3),
      latestAt: newest.publishedAt,
      articleIds: matching.map((a) => a.id),
      independent,
      botVisible: independent && BOT_VISIBLE_TYPES.includes(type),
    });
  }
  return signals.sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime());
}

export function signalText(signal: ChangeSignal): string {
  return `${LABEL[signal.type]} by ${signal.sources.join(" and ")}: ${signal.claim}`;
}
