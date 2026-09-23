import { z } from "zod";

export const PHASES = [
  "PRE_OPEN",
  "OPEN",
  "CLOSED_AWAITING_ALLOTMENT",
  "ALLOTTED",
  "LISTED",
] as const;
export const PhaseName = z.enum(PHASES);
export type Phase = z.infer<typeof PhaseName>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const Slug = z.string().regex(/^[a-z0-9_]+$/, "lowercase letters, digits, underscores");

export const FactStatus = z.enum(["confirmed", "reported"]);
export type FactStatus = z.infer<typeof FactStatus>;

export const SourceRef = z.object({ name: z.string().min(1), url: z.url() });
export type SourceRef = z.infer<typeof SourceRef>;

const verification = {
  status: FactStatus,
  verified_at: IsoDate.nullable(),
  sources: z.array(SourceRef).min(1),
  note: z.string().optional(),
};
type Verification = { status: FactStatus; verified_at: string | null };
const confirmedNeedsDate = (v: Verification) =>
  v.status !== "confirmed" || v.verified_at !== null;
const confirmedMessage = { message: "status: confirmed requires verified_at" };

export const OfferSchema = z
  .object({
    ...verification,
    price_ngn: z.number().positive(),
    min_shares: z.number().int().positive(),
    shares_offered: z.number().int().positive().nullable(),
    greenshoe_max_pct: z.number().positive().nullable(),
    gross_proceeds_ngn_approx: z.number().positive().nullable(),
  })
  .refine(confirmedNeedsDate, confirmedMessage);

const DateEntry = z
  .object({ ...verification, date: IsoDate })
  .refine(confirmedNeedsDate, confirmedMessage);
const TextEntry = z
  .object({ ...verification, text: z.string().min(1) })
  .refine(confirmedNeedsDate, confirmedMessage);

export const NarrativeFactSchema = z
  .object({ ...verification, id: Slug, label: z.string().min(1), text: z.string().min(1) })
  .refine(confirmedNeedsDate, confirmedMessage);

export const IpoFactsSchema = z
  .object({
    issuer: z.string().min(1),
    official_site: z.url(),
    phase_override: PhaseName.nullable(),
    offer: OfferSchema,
    timeline: z.object({
      opens: DateEntry,
      closes: DateEntry,
      allotment: DateEntry.nullable(),
      listing: DateEntry.nullable(),
      listing_expected_text: TextEntry.nullable(),
    }),
    facts: z.array(NarrativeFactSchema),
  })
  .superRefine((ipo, ctx) => {
    if (ipo.timeline.opens.date > ipo.timeline.closes.date) {
      ctx.addIssue({ code: "custom", message: "timeline.opens is after timeline.closes" });
    }
    const ids = ipo.facts.map((f) => f.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "duplicate fact ids" });
    }
  });
export type IpoFacts = z.infer<typeof IpoFactsSchema>;

export const ListingStatus = z.enum(["official", "reported", "unverified", "not_listed"]);
export type ListingStatus = z.infer<typeof ListingStatus>;
export const PlatformType = z.enum([
  "bank",
  "broker",
  "fintech",
  "payments",
  "telco",
  "exchange",
  "other",
]);
export type PlatformType = z.infer<typeof PlatformType>;

export const PlatformSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  type: PlatformType,
  listing_status: ListingStatus,
  named_by: z.array(z.string()).min(1),
  howto_url: z.url().optional(),
  verified_at: IsoDate.optional(),
  note: z.string().optional(),
});
export type Platform = z.infer<typeof PlatformSchema>;

export const PlatformsFileSchema = z
  .object({
    sources: z.record(z.string(), SourceRef),
    platforms: z.array(PlatformSchema),
  })
  .superRefine((file, ctx) => {
    const ids = file.platforms.map((p) => p.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "duplicate platform ids" });
    }
    for (const p of file.platforms) {
      for (const key of p.named_by) {
        if (!(key in file.sources)) {
          ctx.addIssue({ code: "custom", message: `${p.id}: unknown source "${key}"` });
        }
      }
      if (p.listing_status === "official" && !p.verified_at) {
        ctx.addIssue({ code: "custom", message: `${p.id}: official requires verified_at` });
      }
    }
  });
export type PlatformsFile = z.infer<typeof PlatformsFileSchema>;

export const GuideSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  title: z.string().min(1),
  reviewed: z.boolean(),
  body: z.string().min(1),
});
export type Guide = z.infer<typeof GuideSchema>;

export const KnowledgeSchema = z.object({
  builtAt: z.string(),
  ipo: IpoFactsSchema,
  platforms: PlatformsFileSchema,
  guides: z.array(GuideSchema),
  eusate: GuideSchema,
});
export type Knowledge = z.infer<typeof KnowledgeSchema>;
