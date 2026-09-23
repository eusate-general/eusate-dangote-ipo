export const STOPWORDS = new Set([
  "a", "an", "the", "of", "to", "in", "on", "for", "as", "at", "by", "with", "and", "or", "is", "are", "be", "will",
  "how", "what", "why", "when", "your", "you", "this", "that", "its", "it", "from", "over", "after", "says", "say",
]);

export const SIMILARITY_THRESHOLD = 0.6;

export function titleTokens(title: string): Set<string> {
  const cleaned = title
    .toLowerCase()
    .replace(/\s+[|\-–—]\s+[^|\-–—]{2,30}$/, "") // trailing " - Outlet"
    .replace(/[^a-z0-9₦]+/g, " ");
  return new Set(cleaned.split(" ").filter((t) => t.length > 1 && !STOPWORDS.has(t)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

export interface ClusterCandidate {
  id: string;
  title: string;
  publishedAt: Date;
  clusterId: string | null;
}

/**
 * Groups headlines about the same story. `existing` are recent relevant articles already in the database;
 * `fresh` are new ones. The first article of a story becomes the cluster id.
 */
export function assignClusters(fresh: ClusterCandidate[], existing: ClusterCandidate[]): Map<string, string> {
  const pool = existing.map((e) => ({ cluster: e.clusterId ?? e.id, tokens: titleTokens(e.title) }));
  const assigned = new Map<string, string>();

  for (const item of [...fresh].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())) {
    const tokens = titleTokens(item.title);
    let best: { cluster: string; score: number } | null = null;
    for (const candidate of pool) {
      const score = jaccard(tokens, candidate.tokens);
      if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) best = { cluster: candidate.cluster, score };
    }
    const cluster = best?.cluster ?? item.id;
    assigned.set(item.id, cluster);
    pool.push({ cluster, tokens });
  }
  return assigned;
}
