import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";
import { buildDigestMetrics, buildTodayMetrics, type DigestMetrics } from "@/lib/digest/build";
import { getFlaggedAnswers, getRecentDownvotes } from "@/lib/digest/review";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/security/admin";
import { formatWatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

function StatRow({ m }: { m: DigestMetrics }) {
  return (
    <dl className="grid grid-cols-2 gap-y-2.5 text-sm sm:grid-cols-4">
      {[
        ["Visitors", m.uniqueVisitors],
        ["Chatters", m.uniqueChatters],
        ["Conversations", m.conversations],
        ["Messages", m.messages],
        ["Spend", `$${m.spendUsd.toFixed(2)}`],
        ["👍 / 👎", `${m.feedbackUp} / ${m.feedbackDown}`],
        ["Review queue", m.unbackedClaims + m.unknownCitations],
        ["News feed", m.newsIngestOk ? `ok, ${m.newsAgeMinutes}m ago` : "stale"],
      ].map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function AdminPage() {
  const cookieStore = await cookies();
  if (!isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) redirect("/admin/login");

  const now = new Date();
  const [today, yesterday, flagged, downvotes] = await Promise.all([
    buildTodayMetrics(now),
    buildDigestMetrics(now),
    getFlaggedAnswers(),
    getRecentDownvotes(),
  ]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Admin — {formatWatDateTime(now)}</h1>
        <div className="flex items-center gap-3">
          <a href="/api/admin/export" className="text-sm text-ink underline decoration-accent underline-offset-2">
            Export CSV (30d)
          </a>
          <AdminLogoutButton />
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-muted">Today so far (WAT)</h2>
        <div className="mt-2">
          <StatRow m={today} />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-muted">Yesterday ({yesterday.dayLabel})</h2>
        <div className="mt-2">
          <StatRow m={yesterday} />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-base font-semibold">Review queue — flagged answers ({flagged.length})</h2>
        <p className="text-xs text-muted">States a figure with no citation, or cites a marker that did not resolve.</p>
        <ul className="mt-3 divide-y divide-line">
          {flagged.length === 0 && <li className="py-3 text-sm text-muted">Nothing flagged recently.</li>}
          {flagged.map((f) => (
            <li key={f.messageId} className="py-3 text-sm">
              <p className="text-xs text-muted">
                {new Date(f.createdAt).toLocaleString()} · {f.reason}
              </p>
              <p className="mt-1 font-medium">Q: {f.question}</p>
              <p className="mt-1 whitespace-pre-wrap text-muted">{f.answer}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-base font-semibold">Recent 👎 feedback ({downvotes.length})</h2>
        <ul className="mt-3 divide-y divide-line">
          {downvotes.length === 0 && <li className="py-3 text-sm text-muted">No downvotes recently.</li>}
          {downvotes.map((d, i) => (
            <li key={`${d.messageId ?? "unknown"}-${i}`} className="py-3 text-sm">
              <p className="text-xs text-muted">{new Date(d.createdAt).toLocaleString()}</p>
              <p className="mt-1 font-medium">Q: {d.question ?? "(message no longer available)"}</p>
              <p className="mt-1 whitespace-pre-wrap text-muted">{d.answer ?? ""}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
