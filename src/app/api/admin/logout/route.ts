import { clearAdminCookie } from "@/lib/security/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearAdminCookie() } });
}
