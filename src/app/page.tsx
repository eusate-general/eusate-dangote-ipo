import Image from "next/image";
import Link from "next/link";
import { Chat } from "@/components/Chat";
import { LeadForm } from "@/components/LeadForm";
import { NewsFeed } from "@/components/NewsFeed";
import { PageViewTracker } from "@/components/PageViewTracker";
import { PwaInstall } from "@/components/PwaInstall";
import { ShareButton } from "@/components/ShareButton";
import { Tabs } from "@/components/Tabs";
import { TrackedLink } from "@/components/TrackedLink";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { buildCatalog, EUSATE_URL } from "@/lib/catalog";
import { formatBig, formatNgn } from "@/lib/format";
import { getKnowledge } from "@/lib/knowledge";
import type { PlatformType } from "@/lib/knowledge/schema";
import { summarizeVerification } from "@/lib/knowledge/summary";
import { computePhase, SUGGESTED_QUESTIONS, type PhaseInfo } from "@/lib/phase";
import { formatDate } from "@/lib/time";

const TYPE_LABEL: Record<PlatformType, string> = {
  bank: "Banks",
  broker: "Stockbrokers",
  fintech: "Investment & savings apps",
  payments: "Payment apps",
  telco: "Telco / mobile money",
  exchange: "Exchange",
  other: "Other",
};
const TYPE_ORDER: PlatformType[] = ["bank", "broker", "fintech", "payments", "telco", "exchange", "other"];

// Countdown and phase are date-dependent, so refresh the static page every 5 minutes.
export const revalidate = 300;

const GREETING =
  "Hi, I'm Sate — Eusate's AI agent, running here as a free guide to the Dangote refinery IPO. I can explain how the offer works, what it costs and where people are reported to subscribe. I'm unofficial, I can't buy or subscribe for you, and I can't give investment advice. What would you like to know?";

// A single, quiet status line — no card, no banner. Everything else the old status card said
// (verification date, "figures can change") already lives in Chat's own small print and the
// footer's legal paragraph, so it is not repeated here.
function statusLine(info: PhaseInfo): string {
  if (info.phase === "OPEN") {
    return info.daysToClose === 0
      ? "Offer open · reported to close today"
      : `Offer open · reported to close ${formatDate(info.closesOn)}`;
  }
  if (info.phase === "PRE_OPEN") return `Opens ${formatDate(info.opensOn)}`;
  if (info.phase === "CLOSED_AWAITING_ALLOTMENT") return `Offer closed ${formatDate(info.closesOn)} · awaiting allotment`;
  if (info.phase === "ALLOTTED") return "Shares allotted";
  return "Listed";
}

export default function Home() {
  const k = getKnowledge();
  const info = computePhase(k.ipo, new Date());
  const verification = summarizeVerification(k);
  const catalog = buildCatalog(k);
  const { offer, timeline } = k.ipo;

  const recommended = k.platforms.platforms.filter((p) => p.listing_status === "official");
  const byType = new Map<PlatformType, typeof recommended>();
  for (const p of recommended) byType.set(p.type, [...(byType.get(p.type) ?? []), p]);

  const facts: { label: string; value: string }[] = [
    { label: "Offer price", value: `${formatNgn(offer.price_ngn)} per share` },
    { label: "Minimum", value: `${offer.min_shares} shares (${formatNgn(offer.min_shares * offer.price_ngn)})` },
    { label: "Opens", value: formatDate(timeline.opens.date) },
    { label: "Closes", value: formatDate(timeline.closes.date) },
    {
      label: "Listing",
      value: timeline.listing
        ? formatDate(timeline.listing.date)
        : timeline.listing_expected_text
          ? `Expected ${timeline.listing_expected_text.text}`
          : "Not announced",
    },
  ];
  if (offer.shares_offered) {
    facts.push({ label: "Shares offered", value: `${formatBig(offer.shares_offered)} ordinary shares` });
  }

  const keyFactsPanel = (
    <section aria-labelledby="key-facts">
      <h2 id="key-facts" className="text-base font-semibold">
        Key facts
      </h2>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {facts.map((f) => (
          <div key={f.label}>
            <dt className="text-xs uppercase tracking-wide text-muted">{f.label}</dt>
            <dd className="text-sm font-medium">{f.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">
        {verification.confirmed === verification.total ? "Checked by Eusate. " : ""}
        Sources:{" "}
        {[...new Map([...offer.sources, ...timeline.opens.sources, ...timeline.closes.sources].map((s) => [s.url, s])).values()].map((s, i, all) => (
          <span key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
              {s.name}
            </a>
            {i < all.length - 1 ? "; " : ""}
          </span>
        ))}
        .
      </p>
    </section>
  );

  const platformsPanel = (
    <section aria-labelledby="where-to-buy">
      <h2 id="where-to-buy" className="text-base font-semibold">
        {recommended.length} platforms confirmed on the official list
      </h2>
      <p className="mt-1 text-sm text-muted">
        Checked directly against{" "}
        <TrackedLink href={`${k.ipo.official_site}subscribe`} event="platform_click" props={{ platform: "official_site" }} className="font-medium text-ink underline decoration-accent underline-offset-2">
          ipo.dangote.com/subscribe
        </TrackedLink>
        . Confirm there before you pay. Eusate earns nothing from any of them.
      </p>
      <div className="mt-3 space-y-3">
        {TYPE_ORDER.filter((t) => byType.has(t)).map((type) => (
          <div key={type}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{TYPE_LABEL[type]}</p>
            <ul className="mt-1.5 flex flex-wrap gap-2">
              {byType.get(type)!.map((p) => (
                <li key={p.id}>
                  <Link href={`/buy/${p.id}`} className="inline-block rounded-full border border-line bg-canvas px-3 py-1.5 text-sm hover:border-accent">
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <>
      <PageViewTracker />
      <TurnstileWidget />
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Image src="/brand/icon-gradient.svg" alt="" width={24} height={18} priority />
            <p className="text-sm font-semibold">Sate</p>
            <span className="text-xs text-muted">unofficial · by Eusate</span>
          </div>
          <ShareButton text="Free, unofficial guide to the Dangote refinery IPO" className="text-muted hover:text-ink" />
        </div>
      </header>
      <PwaInstall />

      <main className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">
        <p className="text-sm text-muted">{statusLine(info)}</p>

        <Tabs
          defaultTabId="chat"
          tabs={[
            { id: "chat", label: "Chat", content: <Chat catalog={catalog} suggestions={SUGGESTED_QUESTIONS[info.phase]} greeting={GREETING} /> },
            { id: "facts", label: "Key facts", content: keyFactsPanel },
            { id: "platforms", label: `Platforms (${recommended.length})`, content: platformsPanel },
            { id: "news", label: "News", content: <NewsFeed /> },
          ]}
        />

        <p className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-xs text-muted">
          <Image src="/brand/icon-gradient.svg" alt="" width={14} height={11} />
          Powered by Sate ·{" "}
          <TrackedLink href={EUSATE_URL} event="eusate_cta_click" props={{ placement: "footer" }} className="font-medium text-ink underline decoration-accent underline-offset-2">
            eusate.com
          </TrackedLink>
        </p>
        <LeadForm />
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-10 pt-2 text-xs leading-relaxed text-muted">
        <p>
          Unofficial, free guide. Not affiliated with Dangote, NGX or SEC Nigeria, and not investment, financial, tax
          or legal advice or an offer to sell or solicit securities. Figures and dates can change; the prospectus and
          official channels are the only authority. Investing carries risk, including loss of your money, and
          allotment is not guaranteed. Only subscribe through officially approved channels.
        </p>
        <p className="mt-2">
          Privacy: we use an anonymous visitor ID and store chat messages with personal details removed, to improve
          this guide and measure usage. Please don&apos;t share personal details in the chat.
        </p>
      </footer>
    </>
  );
}
