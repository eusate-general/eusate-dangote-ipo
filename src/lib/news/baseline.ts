import { formatBig, formatNgn } from "@/lib/format";
import type { Knowledge } from "@/lib/knowledge/schema";
import { formatDate } from "@/lib/time";

/**
 * Our current published terms, in a few lines. The classifier judges "change" against this baseline,
 * so restating known terms is not a change, while news that contradicts our facts is.
 */
export function buildBaseline(k: Knowledge): string {
  const { offer, timeline } = k.ipo;
  const lines = [
    `Offer price ${formatNgn(offer.price_ngn)} per share; minimum ${offer.min_shares} shares (${formatNgn(offer.min_shares * offer.price_ngn)}).`,
  ];
  if (offer.shares_offered) lines.push(`Shares offered: ${formatBig(offer.shares_offered)}.`);
  if (offer.greenshoe_max_pct) lines.push(`Greenshoe: up to ${offer.greenshoe_max_pct}% extra.`);
  lines.push(`Opens ${formatDate(timeline.opens.date)}; closes ${formatDate(timeline.closes.date)}.`);
  lines.push(timeline.allotment ? `Allotment ${formatDate(timeline.allotment.date)}.` : "Allotment date: not announced.");
  lines.push(
    timeline.listing
      ? `Listing ${formatDate(timeline.listing.date)}.`
      : timeline.listing_expected_text
        ? `Listing: expected ${timeline.listing_expected_text.text}, no date.`
        : "Listing date: not announced.",
  );
  return lines.join(" ");
}
