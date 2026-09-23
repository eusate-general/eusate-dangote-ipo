import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackedLink } from "@/components/TrackedLink";
import { formatNgn } from "@/lib/format";
import { getKnowledge } from "@/lib/knowledge";
import { formatDate } from "@/lib/time";

export const revalidate = 300;

function officialPlatforms() {
  return getKnowledge().platforms.platforms.filter((p) => p.listing_status === "official");
}

export async function generateStaticParams() {
  return officialPlatforms().map((p) => ({ platform: p.id }));
}

function findPlatform(id: string) {
  return officialPlatforms().find((p) => p.id === id) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/buy/[platform]">): Promise<Metadata> {
  const { platform: id } = await params;
  const platform = findPlatform(id);
  if (!platform) return {};
  const title = `How to buy Dangote refinery IPO shares on ${platform.name} | Eusate Guide`;
  const description = `${platform.name} is confirmed on the official Dangote Petroleum Refinery IPO subscription list. Unofficial step-by-step guide by Eusate.`;
  return { title, description, openGraph: { title, description } };
}

export default async function BuyPlatformPage({ params }: PageProps<"/buy/[platform]">) {
  const { platform: id } = await params;
  const platform = findPlatform(id);
  if (!platform) notFound();

  const k = getKnowledge();
  const { offer } = k.ipo;

  return (
    <>
      <header className="border-b border-line bg-surface/90">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-sm font-semibold">
            ← Dangote Refinery IPO guide
          </Link>
          <span className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted">Unofficial</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
        <div>
          <p className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-ink inline-block">
            Confirmed on the official list{platform.verified_at ? ` · checked ${formatDate(platform.verified_at)}` : ""}
          </p>
          <h1 className="mt-3 text-2xl font-semibold">Buy Dangote refinery IPO shares on {platform.name}</h1>
          <p className="mt-2 text-sm text-muted">
            {platform.name} is one of the SEC approved Receiving Agents and Electronic Application Channels listed on the
            official offer site.{platform.note ? ` ${platform.note}` : ""}
          </p>
        </div>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-base font-semibold">Offer terms</h2>
          <dl className="mt-3 grid grid-cols-2 gap-y-2.5 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Price</dt>
              <dd className="font-medium">{formatNgn(offer.price_ngn)}/share</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Minimum</dt>
              <dd className="font-medium">{offer.min_shares} shares</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Opens</dt>
              <dd className="font-medium">{formatDate(k.ipo.timeline.opens.date)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Closes</dt>
              <dd className="font-medium">{formatDate(k.ipo.timeline.closes.date)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-base font-semibold">Generally, how it works</h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
            <li>Open {platform.name} and find its Dangote IPO / subscription section.</li>
            <li>Verify your identity — usually your BVN and matching bank details.</li>
            <li>Choose how many shares (minimum {offer.min_shares}) and pay inside the app.</li>
            <li>Keep your confirmation. Allotment is decided after the offer closes and is not guaranteed.</li>
          </ol>
          <p className="mt-2 text-xs text-muted">
            This is a generic outline, not {platform.name}&apos;s specific screens — Eusate has not seen inside their app.
            Follow their own instructions if these differ.
          </p>
        </section>

        {platform.howto_url && (
          <TrackedLink
            href={platform.howto_url}
            event="platform_click"
            props={{ platform: platform.id, placement: "buy_page" }}
            className="inline-flex w-fit items-center justify-center rounded-xl border border-accent bg-accent-soft px-4 py-2.5 text-sm font-semibold text-ink"
          >
            Go to {platform.name} →
          </TrackedLink>
        )}

        <section className="rounded-2xl border border-line bg-surface p-4 text-sm">
          <p>
            Have a specific question? <Link href="/" className="font-medium text-ink underline decoration-accent underline-offset-2">Ask the guide</Link> or read the{" "}
            <TrackedLink href={`${k.ipo.official_site}subscribe`} event="platform_click" props={{ platform: "official_site" }} className="font-medium text-ink underline decoration-accent underline-offset-2">
              official subscribe page
            </TrackedLink>
            .
          </p>
        </section>
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-10 pt-2 text-xs leading-relaxed text-muted">
        <p>
          Unofficial guide by Eusate. Not affiliated with Dangote, NGX, SEC Nigeria or {platform.name}. Not investment,
          financial or legal advice. Figures can change — confirm on ipo.dangote.com before paying. Investing carries
          risk, including loss of your money, and allotment is not guaranteed.
        </p>
      </footer>
    </>
  );
}
