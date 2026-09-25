import { NextResponse } from "next/server";

import { requireAgency } from "@/lib/api-auth";
import { createAccessLink, resolveAppOrigin } from "@/lib/invites";
import { recordAudit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * A password-reset link for one of the agency's clients, handed back to copy.
 *
 * Whoever holds the link can choose the client's password, so it is limited to
 * that client's own agency (or the platform admin), and every issue is written
 * to the audit log with who asked for it.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/agencies/[slug]/clients/[id]/access-link">
) {
  const { slug, id } = await ctx.params;
  const { profile, agency, response } = await requireAgency(slug, [
    "master_admin",
    "agency_admin",
  ]);
  if (response) return response;

  // Scoped to the agency in the URL as well as the id, so a client id from
  // another agency cannot be used through this agency's address.
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, auth_user_id")
    .eq("id", id)
    .eq("agency_id", agency.id)
    .maybeSingle();

  if (!client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  if (!client.auth_user_id) {
    return NextResponse.json(
      { error: "This client has not accepted their invitation yet, so there is no password to reset." },
      { status: 409 }
    );
  }

  const result = await createAccessLink({
    userId: client.auth_user_id,
    origin: resolveAppOrigin(request),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await recordAudit({
    agencyId: agency.id,
    clientId: client.id,
    actorId: profile.id,
    action: "password_reset_link_issued",
    resourceType: "client",
  });

  return NextResponse.json({ link: result.link, email: result.email });
}
