import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth, requireAgencyAccess } from "@/lib/api-auth";
import { signAgencyState } from "@/lib/google-ads/state";

export async function GET(request: NextRequest) {
  const { profile, response: authError } = await requireApiAuth([
    "master_admin",
    "agency_admin",
  ]);
  if (authError) return authError;

  // The callback writes a refresh token onto whichever agency `state` names,
  // and refuses a connection without one. So the agency is required here and
  // the caller must be entitled to it before the flow begins -- rather than
  // sending someone through Google's consent screen only to fail at the end.
  const agencyId = request.nextUrl.searchParams.get("agencyId");

  if (!agencyId) {
    return NextResponse.json({ error: "agencyId is required." }, { status: 400 });
  }

  const denied = requireAgencyAccess(profile, agencyId);
  if (denied) return denied;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "Google sign-in is not configured." }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/adwords",
    access_type: "offline",
    prompt: "consent",
    // Signed, so the callback can trust it names the agency checked above.
    state: signAgencyState(agencyId),
  });

  const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return NextResponse.redirect(authorizationUrl);
}