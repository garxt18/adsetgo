import { NextResponse } from "next/server";

import { requireAgency } from "@/lib/api-auth";
import { createAccessLink, resolveAppOrigin } from "@/lib/invites";
import { recordAudit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * A password-reset link for an agency's owner. Platform admins only: an agency
 * admin resetting another admin's password would let one owner lock out
 * another, which is not theirs to decide.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/agencies/[slug]/owner-access-link">
) {
  const { profile, agency, response } = await requireAgency((await ctx.params).slug, [
    "master_admin",
  ]);
  if (response) return response;

  const { data: owner } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("agency_id", agency.id)
    .eq("role", "agency_admin")
    .limit(1)
    .maybeSingle();

  if (!owner) {
    return NextResponse.json(
      { error: "This agency's owner has not accepted their invitation yet." },
      { status: 409 }
    );
  }

  const result = await createAccessLink({ userId: owner.id, origin: resolveAppOrigin(request) });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await recordAudit({
    agencyId: agency.id,
    actorId: profile.id,
    action: "password_reset_link_issued",
    resourceType: "agency_owner",
  });

  return NextResponse.json({ link: result.link, email: result.email });
}
