import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  // Diagnostic endpoint: echoes cookie state and profile, so it must never be
  // reachable in a deployed environment.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // Read raw cookie header (may be undefined)
    const cookieHeader = request.headers.get("cookie") ?? null;

    let maskedCookie = null;
    if (cookieHeader) {
      // mask session values
      maskedCookie = cookieHeader.replace(/(?<=sb:token=)[^;]*/g, "***").slice(0, 1000);
    }

    const profile = await getCurrentProfile();

    return NextResponse.json({
      ok: true,
      cookieHeaderPresent: !!cookieHeader,
      cookiePreview: maskedCookie,
      profile: profile ? { id: profile.id, email: profile.email, role: profile.role, agency_id: profile.agency_id } : null,
    });
  } catch (err) {
    console.error("/api/debug/profile error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
