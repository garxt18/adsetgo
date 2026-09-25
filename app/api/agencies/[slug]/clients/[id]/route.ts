import { NextResponse } from "next/server";

import { requireAgency } from "@/lib/api-auth";
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
  const { agency, response } = await requireAgency(slug, ["master_admin", "agency_admin"]);
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

  return NextResponse.json({ success: true, loginsRemoved: removed, loginsFailed: failed });
}

/** Edits a client's name, email or Google Ads account. Nothing else is writable here. */
export async function PATCH(request: Request, ctx: Ctx) {
  const { slug, id } = await ctx.params;
  const { agency, response } = await requireAgency(slug, ["master_admin", "agency_admin"]);
  if (response) return response;

  const body = await request.json().catch(() => null);

  // Only named fields, and only strings: anything else in the body is ignored,
  // so a request cannot move a client to another agency or rewrite its status.
  const changes = Object.fromEntries(
    (["name", "email", "google_ads_customer_id"] as const)
      .filter((key) => typeof body?.[key] === "string" && body[key].trim())
      .map((key) => [key, body[key].trim()])
  );

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
    console.error("Client update failed:", error);
    return NextResponse.json({ error: "The client could not be updated." }, { status: 500 });
  }

  if (!client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  return NextResponse.json(client);
}
