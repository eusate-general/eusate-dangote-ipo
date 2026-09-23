import type { IpoFacts, Phase } from "@/lib/knowledge/schema";
import { daysBetween, watDate } from "@/lib/time";

export interface PhaseInfo {
  phase: Phase;
  overridden: boolean;
  opensOn: string;
  closesOn: string;
  /** Whole days until the offer opens (only before it opens). */
  daysToOpen: number | null;
  /** Whole days until the offer closes; 0 means the last day (only while open). */
  daysToClose: number | null;
}

export function computePhase(ipo: IpoFacts, now: Date): PhaseInfo {
  const today = watDate(now);
  const opensOn = ipo.timeline.opens.date;
  const closesOn = ipo.timeline.closes.date;

  let phase: Phase;
  if (ipo.phase_override) {
    phase = ipo.phase_override;
  } else if (today < opensOn) {
    phase = "PRE_OPEN";
  } else if (today <= closesOn) {
    phase = "OPEN";
  } else if (ipo.timeline.listing && today >= ipo.timeline.listing.date) {
    phase = "LISTED";
  } else if (ipo.timeline.allotment && today >= ipo.timeline.allotment.date) {
    phase = "ALLOTTED";
  } else {
    phase = "CLOSED_AWAITING_ALLOTMENT";
  }

  return {
    phase,
    overridden: ipo.phase_override !== null,
    opensOn,
    closesOn,
    daysToOpen: phase === "PRE_OPEN" ? daysBetween(today, opensOn) : null,
    daysToClose: phase === "OPEN" ? daysBetween(today, closesOn) : null,
  };
}

export const PHASE_LABEL: Record<Phase, string> = {
  PRE_OPEN: "Opens soon",
  OPEN: "Offer open",
  CLOSED_AWAITING_ALLOTMENT: "Offer closed, awaiting allotment",
  ALLOTTED: "Shares allotted",
  LISTED: "Listed",
};

export const SUGGESTED_QUESTIONS: Record<Phase, string[]> = {
  PRE_OPEN: [
    "When does the offer open?",
    "How do I prepare to subscribe?",
    "What is CSCS and do I need one?",
    "Which platforms can I use?",
  ],
  OPEN: [
    "How do I buy shares?",
    "What is the minimum I can invest?",
    "Which platforms can I use?",
    "When does the offer close?",
  ],
  CLOSED_AWAITING_ALLOTMENT: [
    "When will allotment be announced?",
    "What happens to my money if I get fewer shares?",
    "When will the shares list?",
    "Can I still buy?",
  ],
  ALLOTTED: [
    "How do I check my allotment?",
    "When will the shares start trading?",
    "How do I refund or check a refund?",
    "How do I sell after listing?",
  ],
  LISTED: [
    "How do I buy or sell the shares now?",
    "What is a CSCS account used for?",
    "What are the risks of holding?",
    "Who is Eusate?",
  ],
};
