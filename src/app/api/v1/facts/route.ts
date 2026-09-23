import { getKnowledge } from "@/lib/knowledge";
import { computePhase } from "@/lib/phase";

export const dynamic = "force-dynamic";

// Compact, source-carrying JSON. Also the shape a future Eusate DevSpace (lab) function can call.
export async function GET() {
  const { ipo, builtAt } = getKnowledge();
  const phase = computePhase(ipo, new Date());

  return Response.json(
    {
      updatedAt: builtAt,
      phase: phase.phase,
      daysToClose: phase.daysToClose,
      issuer: ipo.issuer,
      officialSite: ipo.official_site,
      offer: ipo.offer,
      timeline: ipo.timeline,
      facts: ipo.facts,
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
