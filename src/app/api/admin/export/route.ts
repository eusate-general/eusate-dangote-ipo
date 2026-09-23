import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/security/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAYS = 30;

function csvField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  if (!isAdminSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - DAYS * 86_400_000);
  const rows = await getDb().execute<{ ts: string; visitor_id: string; session_id: string | null; type: string; props: unknown }>(sql`
    select ts, visitor_id, session_id, type, props from events
    where ts >= ${since.toISOString()}::timestamptz
    order by ts asc
  `);

  const header = ["ts", "visitor_id", "session_id", "type", "props"].join(",");
  const body = rows.map((r) => [r.ts, r.visitor_id, r.session_id, r.type, JSON.stringify(r.props)].map(csvField).join(","));
  const csv = [header, ...body].join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="events-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
