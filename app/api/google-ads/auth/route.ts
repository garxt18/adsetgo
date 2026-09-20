import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // Allow starting OAuth for a specific agency via ?agencyId=<id>
  const agencyId = request.nextUrl.searchParams.get("agencyId") ?? "";

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_ADS_REDIRECT_URI!,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/adwords",
    access_type: "offline",
    prompt: "consent",
  });

  // Pass agencyId in state so callback knows where to store refresh token.
  if (agencyId) {
    params.set("state", agencyId);
  }

  const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return NextResponse.redirect(authorizationUrl);
}