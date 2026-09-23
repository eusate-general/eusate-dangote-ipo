export interface NewsSource {
  id: string;
  name: string;
  kind: "rss" | "wp-json";
  url: string;
  /** General feeds carry every story, so they need a cheap keyword pre-filter. Search endpoints are already targeted. */
  prefilter: boolean;
}

const wpSearch = (host: string) =>
  `${host}/wp-json/wp/v2/posts?search=dangote%20ipo&per_page=20&orderby=date&_fields=date_gmt,link,title,excerpt`;

/**
 * Chosen from a live probe on 2026-09-19. Nairametrics, Punch, Vanguard and BusinessDay block search but serve
 * open general feeds. TheCable, Guardian, The Nation, Legit, Bloomberg and Reuters return 403/401 to
 * non-browser clients and are deliberately left out rather than worked around.
 */
export const SOURCES: NewsSource[] = [
  { id: "nairametrics", name: "Nairametrics", kind: "rss", url: "https://nairametrics.com/feed/", prefilter: true },
  { id: "punch", name: "Punch", kind: "rss", url: "https://punchng.com/feed/", prefilter: true },
  { id: "vanguard", name: "Vanguard", kind: "rss", url: "https://www.vanguardngr.com/feed/", prefilter: true },
  { id: "businessday", name: "BusinessDay", kind: "rss", url: "https://businessday.ng/feed/", prefilter: true },
  { id: "premiumtimes", name: "Premium Times", kind: "wp-json", url: wpSearch("https://www.premiumtimesng.com"), prefilter: false },
  { id: "channels", name: "Channels TV", kind: "wp-json", url: wpSearch("https://www.channelstv.com"), prefilter: false },
  { id: "techcabal", name: "TechCabal", kind: "wp-json", url: wpSearch("https://techcabal.com"), prefilter: false },
  { id: "businesspost", name: "BusinessPost", kind: "wp-json", url: wpSearch("https://businesspost.ng"), prefilter: false },
  { id: "thisday", name: "ThisDay", kind: "wp-json", url: wpSearch("https://www.thisdaylive.com"), prefilter: false },
  { id: "dailypost", name: "Daily Post", kind: "wp-json", url: wpSearch("https://dailypost.ng"), prefilter: false },
];

export const USER_AGENT = "EusateDangoteIPOGuide/1.0 (+https://dangoterefineryipo.eusate.com)";

/** Ignore anything older than this. The offer was announced weeks before it opened. */
export const MAX_ARTICLE_AGE_DAYS = 45;
