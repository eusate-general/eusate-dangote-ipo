"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/client/time";
import { formatDate, watDate } from "@/lib/time";
import { TrackedLink } from "./TrackedLink";

interface Item {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary: string;
}

interface Feed {
  items: Item[];
  updatedAt: string | null;
}

/** Loaded in the browser so the static page never depends on the database at build time. */
export function NewsFeed() {
  const [feed, setFeed] = useState<Feed | "error" | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/news?limit=6")
      .then((res) => (res.ok ? (res.json() as Promise<Feed>) : Promise.reject(new Error(String(res.status)))))
      .then((data) => alive && setFeed(data))
      .catch(() => alive && setFeed("error"));
    return () => {
      alive = false;
    };
  }, []);

  if (feed === "error") return null;

  return (
    <section aria-labelledby="latest-news" className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="latest-news" className="text-base font-semibold">
          Latest news
        </h2>
        {feed?.updatedAt && <p className="text-xs text-muted">Updated {timeAgo(feed.updatedAt)}</p>}
      </div>

      {feed === null && <p className="mt-3 text-sm text-muted">Loading the latest reports…</p>}
      {feed && feed.items.length === 0 && (
        <p className="mt-3 text-sm text-muted">No recent reports found yet. Check back soon.</p>
      )}

      {feed && feed.items.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {feed.items.map((item) => (
            <li key={item.id} className="py-3 first:pt-0 last:pb-0">
              <p className="text-xs text-muted">
                {item.source} · {formatDate(watDate(new Date(item.publishedAt)))}
              </p>
              <TrackedLink
                href={item.url}
                event="news_click"
                props={{ source: item.source }}
                className="mt-0.5 block text-sm font-medium underline-offset-2 hover:underline"
              >
                {item.title}
              </TrackedLink>
              {item.summary && <p className="mt-1 text-sm text-muted">{item.summary}</p>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">Press reports from Nigerian outlets, summarised by Eusate. Not official notices.</p>
    </section>
  );
}
