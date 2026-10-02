import { NextRequest, NextResponse } from "next/server";

import { buildAgencyOverview } from "@/lib/agency-overview";
import { requireAgency } from "@/lib/api-auth";
import { resolveRange } from "@/lib/google-ads/date-range";

/** The agency's client list with figures for the chosen period. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/agencies/[slug]/overview">
) {
  const { agency, response } = await requireAgency((await ctx.params).slug, [
    "master_admin",
    "agency_admin",
  ]);
  if (response) return response;

  const range = resolveRange(request.nextUrl.searchParams.get("dateRange") ?? "last_7_days");

  return NextResponse.json(await buildAgencyOverview(agency, range));
}
