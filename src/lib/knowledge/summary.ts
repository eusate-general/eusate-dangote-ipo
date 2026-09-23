import type { Knowledge } from "./schema";

export interface VerificationSummary {
  confirmed: number;
  total: number;
  /** Most recent verified_at among confirmed facts (YYYY-MM-DD), if any. */
  latest: string | null;
}

/** How much of the key facts sheet a human has confirmed. Drives the site label and the bot's caveats. */
export function summarizeVerification(k: Knowledge): VerificationSummary {
  const { offer, timeline, facts } = k.ipo;
  const items = [
    offer,
    timeline.opens,
    timeline.closes,
    timeline.allotment,
    timeline.listing,
    timeline.listing_expected_text,
    ...facts,
  ].filter((i): i is NonNullable<typeof i> => i !== null);

  const confirmed = items.filter((i) => i.status === "confirmed");
  const latest =
    confirmed
      .map((i) => i.verified_at)
      .filter((d): d is string => d !== null)
      .sort()
      .at(-1) ?? null;

  return { confirmed: confirmed.length, total: items.length, latest };
}
