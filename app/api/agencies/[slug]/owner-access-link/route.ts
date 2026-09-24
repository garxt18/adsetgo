import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
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
  { params }: { params: Promise<{ slug: string }> }
) {
  const { profile, response: authError } = await requireApiAuth(["master_admin"]);
  if (authError) return authError;

  const { slug } = await params;

  const { data: agency } = await supabaseAdmin
    .from("agencies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!agency) {
    return NextResponse.json({ error: "Agency not found." }, { status: 404 });
  }

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
