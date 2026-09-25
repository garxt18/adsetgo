import { NextResponse } from "next/server";

import { requireAgency } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { parseGoogleAdsCustomerId } from "@/lib/google-ads/format";
import { deleteLogins, loginsBelongingTo } from "@/lib/invites";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = RouteContext<"/api/agencies/[slug]/clients/[id]">;

/**
 * Removes one of the agency's clients and that client's login. Scoped to the
 * agency in the URL as well as the id, so a client id from another agency
 * cannot be reached through it.
 */
export async function DELETE(_request: Request, ctx: Ctx) {
  const { slug, id } = await ctx.params;
  const { profile, agency, response } = await requireAgency(slug, [
    "master_admin",
    "agency_admin",
  ]);
  if (response) return response;

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("id", id)
    .eq("agency_id", agency.id)
    .maybeSingle();

  if (!client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  const logins = await loginsBelongingTo({ agencyId: agency.id, clientId: client.id });

  const { error } = await supabaseAdmin.from("clients").delete().eq("id", client.id);

  if (error) {
    console.error("Client delete failed:", error);
    return NextResponse.json({ error: "The client could not be removed." }, { status: 500 });
  }

  const { removed, failed } = await deleteLogins(logins);

  // The client row is gone, so it is named in resource_id rather than client_id.
  await recordAudit({
    agencyId: agency.id,
    actorId: profile.id,
    action: "client_removed",
    resourceType: "client",
    resourceId: client.id,
  });

  return NextResponse.json({ success: true, loginsRemoved: removed, loginsFailed: failed });
}

/**
 * Renames a client or points it at a different Google Ads account.
 *
 * The email is deliberately not editable: it is the client's sign-in address,
 * so changing it here would only change a label while they kept signing in
 * with the old one -- and quietly moving someone's sign-in to another address
 * is how an account is taken over. To change it, remove the client and add
 * them again.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  const { slug, id } = await ctx.params;
  const { profile, agency, response } = await requireAgency(slug, [
    "master_admin",
    "agency_admin",
  ]);
  if (response) return response;

  const body = await request.json().catch(() => null);
  const changes: { name?: string; google_ads_customer_id?: string } = {};

  // Only these two fields, whatever else the body carries, so a request cannot
  // move a client to another agency or rewrite its status.
  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "The name cannot be empty." }, { status: 400 });
    changes.name = name;
  }

  if (body?.google_ads_customer_id !== undefined) {
    const customerId = parseGoogleAdsCustomerId(body.google_ads_customer_id);
    if (!customerId) {
      return NextResponse.json(
        { error: "A Google Ads customer ID is ten digits, like 123-456-7890." },
        { status: 400 }
      );
    }
    changes.google_ads_customer_id = customerId;
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const { data: client, error } = await supabaseAdmin
    .from("clients")
    .update(changes)
    .eq("id", id)
    .eq("agency_id", agency.id)
    .select("id, name, email, status, google_ads_customer_id")
    .maybeSingle();

  if (error) {
    const duplicate = error.code === "23505";
    if (!duplicate) console.error("Client update failed:", error);

    return NextResponse.json(
      {
        error: duplicate
          ? "That Google Ads account is already a client of this agency."
          : "The client could not be updated.",
      },
      { status: duplicate ? 409 : 500 }
    );
  }

  if (!client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  await recordAudit({
    agencyId: agency.id,
    clientId: client.id,
    actorId: profile.id,
    action: "client_updated",
    resourceType: "client",
  });

  return NextResponse.json(client);
}
