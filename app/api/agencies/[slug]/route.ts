import { NextResponse } from "next/server";

import { requireAgency } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { deleteLogins, loginsBelongingTo } from "@/lib/invites";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Removes an agency, its clients (the foreign key cascades) and the logins of
 * its owner and clients. Platform admins only.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/agencies/[slug]">) {
  const { profile, agency, response } = await requireAgency((await ctx.params).slug, [
    "master_admin",
  ]);
  if (response) return response;

  // Whose logins these are must be read first: deleting the agency clears the
  // agency_id on their profiles, after which nothing says whose they were.
  const logins = await loginsBelongingTo({ agencyId: agency.id });

  const { error } = await supabaseAdmin.from("agencies").delete().eq("id", agency.id);

  if (error) {
    // The database's own message stays in the server log; it describes the
    // schema, which is nobody's business in a browser.
    console.error("Agency delete failed:", error);
    return NextResponse.json({ error: "The agency could not be removed." }, { status: 500 });
  }

  const { removed, failed } = await deleteLogins(logins);

  // Platform-level, because the agency's own entries were deleted with it.
  await recordAudit({
    agencyId: null,
    actorId: profile.id,
    action: "agency_removed",
    resourceType: "agency",
    resourceId: agency.slug,
  });

  return NextResponse.json({ success: true, loginsRemoved: removed, loginsFailed: failed });
}
