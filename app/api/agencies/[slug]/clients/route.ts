import { NextResponse } from "next/server";

import { requireAgency } from "@/lib/api-auth";
import { parseGoogleAdsCustomerId } from "@/lib/google-ads/format";
import { createInvite, resolveAppOrigin } from "@/lib/invites";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Adds a client to an agency and returns a single-use invitation link for them. */
export async function POST(request: Request, ctx: RouteContext<"/api/agencies/[slug]/clients">) {
  const { agency, response } = await requireAgency((await ctx.params).slug, [
    "master_admin",
    "agency_admin",
  ]);
  if (response) return response;

  try {
    const { name, email, google_ads_customer_id } = await request.json();

    if (!name || !email || !google_ads_customer_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Stored as ten digits however it was typed, so the one-client-per-account
    // rule cannot be sidestepped by adding dashes.
    const customerId = parseGoogleAdsCustomerId(google_ads_customer_id);

    if (!customerId) {
      return NextResponse.json(
        { error: "A Google Ads customer ID is ten digits, like 123-456-7890." },
        { status: 400 }
      );
    }

    // Create client
    const { data: newClient, error: clientError } = await supabaseAdmin
      .from("clients")
      .insert({
        agency_id: agency.id,
        name,
        email,
        google_ads_customer_id: customerId,
        status: "invited",
      })
      .select()
      .maybeSingle();

    if (clientError) {
      // The one failure worth naming: the same Google Ads account twice.
      const duplicate = clientError.code === "23505";
      if (!duplicate) console.error("Client insert failed:", clientError);

      return NextResponse.json(
        {
          error: duplicate
            ? "That Google Ads account is already a client of this agency."
            : "The client could not be added.",
        },
        { status: duplicate ? 409 : 500 }
      );
    }

    if (!newClient) {
      return NextResponse.json(
        { error: "Failed to create client" },
        { status: 500 }
      );
    }

    const invite = await createInvite({
      email,
      role: "client",
      agencyId: agency.id,
      agencySlug: agency.slug,
      clientId: newClient.id,
      origin: resolveAppOrigin(request),
    });

    if (!invite.ok) {
      return NextResponse.json(
        { ...newClient, signInLink: null, inviteError: invite.error },
        { status: 201 }
      );
    }

    // Bind the login to this client record here, so accepting the invite never
    // has to be trusted to say which client it belongs to.
    await supabaseAdmin
      .from("clients")
      .update({ auth_user_id: invite.userId })
      .eq("id", newClient.id);

    return NextResponse.json(
      { ...newClient, auth_user_id: invite.userId, signInLink: invite.signInLink },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating client:", error);
    return NextResponse.json(
      { error: "Failed to create client" },
      { status: 500 }
    );
  }
}
