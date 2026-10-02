import { NextRequest } from "next/server";

import { buildAgencyOverview } from "@/lib/agency-overview";
import { requireAgency } from "@/lib/api-auth";
import { resolveRange } from "@/lib/google-ads/date-range";
import { AgencyReportPdf } from "@/lib/pdf/agency-report";
import { fileSlug, pdfResponse } from "@/lib/pdf/kit";

/** The agency dashboard's figures for a period, as a PDF download. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/agencies/[slug]/overview/pdf">
) {
  const { agency, response } = await requireAgency((await ctx.params).slug, [
    "master_admin",
    "agency_admin",
  ]);
  if (response) return response;

  const range = resolveRange(request.nextUrl.searchParams.get("dateRange") ?? "last_7_days");
  const overview = await buildAgencyOverview(agency, range);

  return pdfResponse(
    <AgencyReportPdf overview={overview} />,
    `${fileSlug(agency.name)}-agency-report-${range.start}-to-${range.end}.pdf`
  );
}
