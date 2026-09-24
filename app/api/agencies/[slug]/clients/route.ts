import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireApiAuth, requireAgencyAccess } from "@/lib/api-auth";
import { createInvite, resolveAppOrigin } from "@/lib/invites";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { profile, response: authError } = await requireApiAuth([
    "master_admin",
    "agency_admin",
  ]);
  if (authError) return authError;

  try {
    const { slug } = await params;

    // Get agency by slug
    const { data: agencyData, error: agencyError } = await supabaseAdmin
      .from("agencies")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (agencyError || !agencyData) {
      return NextResponse.json(
        { error: "Agency not found" },
        { status: 404 }
      );
    }

    const denied = requireAgencyAccess(profile, agencyData.id);
    if (denied) return denied;

    // Get clients for this agency
    const { data: clientsData, error: clientsError } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("agency_id", agencyData.id)
      .order("created_at", { ascending: false });

    if (clientsError) {
      return NextResponse.json(
        { error: clientsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(clientsData ?? []);
  } catch (error) {
    console.error("Error fetching clients:", error);
    return NextResponse.json(
      { error: "Failed to fetch clients" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { profile, response: authError } = await requireApiAuth([
    "master_admin",
    "agency_admin",
  ]);
  if (authError) return authError;

  try {
    const { slug } = await params;
    const body = await request.json();
    const { name, email, google_ads_customer_id } = body;

    if (!name || !email || !google_ads_customer_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get agency by slug
    const { data: agencyData, error: agencyError } = await supabaseAdmin
      .from("agencies")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (agencyError || !agencyData) {
      return NextResponse.json(
        { error: "Agency not found" },
        { status: 404 }
      );
    }

    const denied = requireAgencyAccess(profile, agencyData.id);
    if (denied) return denied;

    // Create client
    const { data: newClient, error: clientError } = await supabaseAdmin
      .from("clients")
      .insert({
        agency_id: agencyData.id,
        name,
        email,
        google_ads_customer_id,
        status: "invited",
      })
      .select()
      .maybeSingle();

    if (clientError) {
      return NextResponse.json(
        { error: clientError.message },
        { status: 500 }
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
      agencyId: agencyData.id,
      clientId: newClient.id,
      origin: resolveAppOrigin(request),
    });

    if (!invite.ok) {
      return NextResponse.json(
        { ...newClient, inviteLink: null, inviteError: invite.error },
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
      { ...newClient, auth_user_id: invite.userId, inviteLink: invite.inviteLink },
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
