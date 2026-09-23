import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth, requireAgencyAccess } from "@/lib/api-auth";
import { signAgencyState } from "@/lib/google-ads/state";

export async function GET(request: NextRequest) {
  const { profile, response: authError } = await requireApiAuth([
    "master_admin",
    "agency_admin",
  ]);
  if (authError) return authError;

  // Allow starting OAuth for a specific agency via ?agencyId=<id>
  const agencyId = request.nextUrl.searchParams.get("agencyId") ?? "";

  // The callback writes a refresh token onto whichever agency `state` names, so
  // the caller must be entitled to that agency before the flow begins.
  if (agencyId) {
    const denied = requireAgencyAccess(profile, agencyId);
    if (denied) return denied;
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_ADS_REDIRECT_URI!,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/adwords",
    access_type: "offline",
    prompt: "consent",
  });

  // The callback trusts `state` to name the agency, so it carries a signature
  // proving the access check above happened for this exact agency.
  if (agencyId) {
    params.set("state", signAgencyState(agencyId));
  }

  const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return NextResponse.redirect(authorizationUrl);
}