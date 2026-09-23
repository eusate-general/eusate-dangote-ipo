const TOPIC = /dangote/i;
const OFFER =
  /\b(ipo|public offer(?:ing)?|initial public|subscri\w*|listing|listed|prospectus|allot\w*|shares?|ngx|nigerian exchange|greenshoe|stockbroker|cscs)\b/i;

// Whole path segments only, so a headline slug like "promoted-to-lead-refinery" is not caught.
const PROMOTIONAL_SEGMENTS = new Set([
  "promoted",
  "sponsored",
  "advertorial",
  "partner-content",
  "paid-content",
  "sponsored-content",
  "promoted-content",
  "brand-content",
]);

/** Paid placements (for example Premium Times `/promoted/`) are advertising, not news. */
export function isPromotional(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().split("/").some((segment) => PROMOTIONAL_SEGMENTS.has(segment));
  } catch {
    return false;
  }
}

/** Cheap, generous first pass for general feeds. The summariser makes the real call. */
export function isPossiblyRelevant(item: { title: string; text: string }): boolean {
  const haystack = `${item.title} ${item.text}`;
  return TOPIC.test(haystack) && OFFER.test(haystack);
}
