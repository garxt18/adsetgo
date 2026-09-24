import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { createInvite, resolveAppOrigin } from "@/lib/invites";
import { NextResponse } from "next/server";

export async function GET() {
  const { response: authError } = await requireApiAuth(["master_admin"]);
  if (authError) return authError;

  try {
    // Use admin client to bypass RLS and fetch all agencies
    // Never select google_ads_refresh_token here: this list is rendered in a
    // browser, and the token is a standing credential for the agency's ads.
    // The embedded count lets the dashboard report real client numbers rather
    // than estimate them.
    const { data, error } = await supabaseAdmin
      .from("agencies")
      .select(
        "id, name, slug, google_ads_manager_customer_id, google_ads_connection_status, created_at, updated_at, clients(count), profiles(email, role)"
      )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    type AgencyRow = Record<string, unknown> & {
      clients?: Array<{ count: number }>;
      profiles?: Array<{ email: string | null; role: string }>;
    };

    const agencies = ((data ?? []) as AgencyRow[]).map(
      ({ clients, profiles, ...agency }) => ({
        ...agency,
        client_count: clients?.[0]?.count ?? 0,
        owner_email:
          profiles?.find((p) => p.role === "agency_admin")?.email ?? null,
      })
    );

    return NextResponse.json(agencies);
  } catch (error) {
    console.error("Error fetching agencies:", error);
    return NextResponse.json(
      { error: "Failed to fetch agencies" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { response: authError } = await requireApiAuth(["master_admin"]);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { name, slug, google_ads_manager_customer_id, ownerEmail } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Agency name and slug are required" },
        { status: 400 }
      );
    }

    if (!ownerEmail) {
      return NextResponse.json(
        { error: "Agency owner email is required to send an invitation" },
        { status: 400 }
      );
    }

    const { data: newAgency, error } = await supabaseAdmin
      .from("agencies")
      .insert({
        name,
        slug,
        google_ads_manager_customer_id: google_ads_manager_customer_id || null,
        // Supplying a manager ID is not the same as having authorised Google.
        // Only the OAuth callback may mark an agency "connected".
        google_ads_connection_status: "disconnected",
      })
      .select(
        "id, name, slug, google_ads_manager_customer_id, google_ads_connection_status, created_at, updated_at"
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!newAgency) {
      return NextResponse.json(
        { error: "Failed to create agency" },
        { status: 500 }
      );
    }

    // The owner gets a single-use link rather than a public signup page, so the
    // only person who can claim this agency is the address named here.
    const invite = await createInvite({
      email: ownerEmail,
      role: "agency_admin",
      agencyId: newAgency.id,
      origin: resolveAppOrigin(request),
    });

    if (!invite.ok) {
      // The agency exists but has no owner yet; say so instead of implying the
      // invitation went out.
      return NextResponse.json(
        { ...newAgency, inviteLink: null, inviteError: invite.error },
        { status: 201 }
      );
    }

    return NextResponse.json(
      { ...newAgency, inviteLink: invite.inviteLink },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating agency:", error);
    return NextResponse.json(
      { error: "Failed to create agency" },
      { status: 500 }
    );
  }
}
