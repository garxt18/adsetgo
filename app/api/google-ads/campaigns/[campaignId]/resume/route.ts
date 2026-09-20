import { NextRequest, NextResponse } from "next/server";

import { getCurrentProfile } from "../../../../../../lib/supabase-server";

export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { campaignId } = { campaignId: request.nextUrl.pathname.split("/").at(-2) ?? "" };

  return NextResponse.json({
    success: true,
    campaignId,
    action: "resumed",
    message: "Campaign resume workflow is available for authorized users only.",
  });
}
