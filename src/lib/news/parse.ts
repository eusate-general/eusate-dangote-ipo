import { XMLParser } from "fast-xml-parser";
import { canonicalizeUrl, stripHtml } from "./text";

export interface FeedItem {
  sourceId: string;
  sourceName: string;
  url: string;
  title: string;
  publishedAt: Date;
  /** Publisher excerpt, used only to summarise and classify. It is not stored. */
  text: string;
}

interface SourceRef {
  id: string;
  name: string;
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return asText(value[0]);
  if (value && typeof value === "object" && "#text" in value) return asText((value as Record<string, unknown>)["#text"]);
  return "";
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function atomLink(link: unknown): string {
  const links = asArray<Record<string, unknown> | string>(link as Record<string, unknown> | string | undefined);
  for (const l of links) {
    if (typeof l === "string") return l;
    const rel = asText(l["@_rel"]);
    if (!rel || rel === "alternate") return asText(l["@_href"]);
  }
  return "";
}

function build(src: SourceRef, title: string, link: string, published: string, html: string): FeedItem | null {
  const url = canonicalizeUrl(link);
  const publishedAt = new Date(published);
  const cleanTitle = stripHtml(title);
  if (!url || !cleanTitle || Number.isNaN(publishedAt.getTime())) return null;
  return {
    sourceId: src.id,
    sourceName: src.name,
    url: link.trim(),
    title: cleanTitle,
    publishedAt,
    text: stripHtml(html),
  };
}

/** RSS 2.0, RSS 1.0 (RDF) and Atom. Malformed entries are skipped, not fatal. */
export function parseFeed(body: string, src: SourceRef): FeedItem[] {
  const root = xml.parse(body) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const rssItems = asArray<Record<string, unknown>>(root.rss?.channel?.item ?? root["rdf:RDF"]?.item);
  const atomEntries = asArray<Record<string, unknown>>(root.feed?.entry);
  if (rssItems.length === 0 && atomEntries.length === 0 && !root.rss && !root.feed && !root["rdf:RDF"]) {
    throw new Error("not an RSS or Atom feed");
  }

  const items: FeedItem[] = [];
  for (const it of rssItems) {
    const item = build(
      src,
      asText(it.title),
      asText(it.link),
      asText(it.pubDate) || asText(it["dc:date"]),
      asText(it["content:encoded"]) || asText(it.description),
    );
    if (item) items.push(item);
  }
  for (const entry of atomEntries) {
    const item = build(
      src,
      asText(entry.title),
      atomLink(entry.link),
      asText(entry.published) || asText(entry.updated),
      asText(entry.content) || asText(entry.summary),
    );
    if (item) items.push(item);
  }
  return items;
}

interface WpPost {
  date_gmt?: string;
  link?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
}

/** WordPress REST API posts (`/wp-json/wp/v2/posts`). date_gmt has no zone suffix, so add one. */
export function parseWpJson(body: string, src: SourceRef): FeedItem[] {
  const posts = JSON.parse(body) as unknown;
  if (!Array.isArray(posts)) throw new Error("unexpected WordPress API response");

  const items: FeedItem[] = [];
  for (const post of posts as WpPost[]) {
    if (!post.date_gmt || !post.link) continue;
    const item = build(src, post.title?.rendered ?? "", post.link, `${post.date_gmt}Z`, post.excerpt?.rendered ?? "");
    if (item) items.push(item);
  }
  return items;
}
