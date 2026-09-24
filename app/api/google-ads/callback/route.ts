import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyAgencyState } from "@/lib/google-ads/state";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.json(
      { error },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json(
      { error: "Authorization code not found" },
      { status: 400 }
    );
  }

  // This route has no session of its own: Google sends the browser here. The
  // only thing tying the incoming code to an agency is `state`, so an unsigned
  // or expired one is refused rather than trusted.
  const agencyId = verifyAgencyState(searchParams.get("state"));
  let redirectSlug: string | null = null;

  if (!agencyId) {
    return NextResponse.json(
      { error: "Invalid or expired authorization state. Start the connection again." },
      { status: 400 }
    );
  }

  const tokenResponse = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_ADS_REDIRECT_URI!,
        grant_type: "authorization_code",
      }),
    }
  );

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok) {
    return NextResponse.json(
      {
        error: "Failed to exchange authorization code",
        details: tokenData,
      },
      { status: 500 }
    );
  }

  {
    const { data: agency } = await supabaseAdmin
      .from("agencies")
      .select("id, slug")
      .eq("id", agencyId)
      .maybeSingle();

    if (agency) {
      redirectSlug = agency.slug;
      const updatePayload: Record<string, string> = {
        google_ads_connection_status: "connected",
      };
      if (tokenData.refresh_token) {
        updatePayload.google_ads_refresh_token = tokenData.refresh_token;
      }
      try {
        await supabaseAdmin
          .from("agencies")
          .update(updatePayload)
          .eq("id", agency.id);
      } catch (err) {
        console.error("Failed to persist agency refresh token:", err);
      }
    }
  }

  function getValidClientOrigin(req: NextRequest): string {
    if (process.env.GOOGLE_ADS_REDIRECT_URI) {
      try {
        const uriOrigin = new URL(process.env.GOOGLE_ADS_REDIRECT_URI).origin;
        if (uriOrigin && !uriOrigin.includes("0.0.0.0")) {
          return uriOrigin;
        }
      } catch {}
    }

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const proto = req.headers.get("x-forwarded-proto") || "http";

    if (host) {
      const cleanHost = host.replace(/^0\.0\.0\.0/, "localhost");
      return `${proto}://${cleanHost}`;
    }

    try {
      const parsed = new URL(req.url);
      if (parsed.hostname === "0.0.0.0") {
        parsed.hostname = "localhost";
      }
      return parsed.origin;
    } catch {
      return "http://localhost:3001";
    }
  }

  const baseOrigin = getValidClientOrigin(request);

  // If redirectSlug is found, redirect to agency dashboard
  if (redirectSlug) {
    const redirectUrl = new URL(`/agencies/${redirectSlug}/dashboard?connected=1`, baseOrigin);
    return NextResponse.redirect(redirectUrl);
  }

  // Otherwise redirect to main dashboard
  const redirectUrl = new URL(`/dashboard?connected=1`, baseOrigin);
  return NextResponse.redirect(redirectUrl);
}