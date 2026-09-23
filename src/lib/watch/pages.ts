export interface WatchedPage {
  id: string;
  url: string;
  label: string;
}

/**
 * Pages on the official site whose content matters enough to watch. Chosen 2026-09-19 from a
 * manual render: the homepage times out under a strict "networkidle" wait (something on it keeps
 * polling), so the watcher uses a "load" wait instead — these three all rendered cleanly that way.
 */
export const WATCHED_PAGES: WatchedPage[] = [
  { id: "subscribe", url: "https://ipo.dangote.com/subscribe", label: "Offer terms and the approved-channel list" },
  { id: "how_to_subscribe", url: "https://ipo.dangote.com/how-to-subscribe", label: "How-to-subscribe / offer summary" },
  { id: "faq", url: "https://ipo.dangote.com/faq", label: "Official FAQ" },
];
