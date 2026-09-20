import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await context.params;

    // Verify agency exists
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

    // Delete client
    const { error: deleteError } = await supabaseAdmin
      .from("clients")
      .delete()
      .eq("id", id)
      .eq("agency_id", agencyData.id);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting client:", error);
    return NextResponse.json(
      { error: "Failed to delete client" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await context.params;

    console.log(`[api] GET client - params received: slug=${slug} id=${id}`);

    // Verify agency exists
    const { data: agencyData, error: agencyError } = await supabaseAdmin
      .from("agencies")
      .select("id, slug, google_ads_manager_customer_id")
      .eq("slug", slug)
      .maybeSingle();

    console.log("[api] agency query result:", { agencyData, agencyError });

    if (agencyError || !agencyData) {
      const debug = request.url.includes("debug=1");
      const body: Record<string, unknown> = { error: "Agency not found" };
      if (debug) {
        body._debug = {
          slugReceived: slug,
          agencyQueryError: agencyError?.message ?? null,
          agencyData,
        };
      }
      return NextResponse.json(body, { status: 404 });
    }

    const { data: clientData, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("id", id)
      .eq("agency_id", agencyData.id)
      .maybeSingle();

    if (clientError || !clientData) {
      const debug = request.url.includes("debug=1");
      const body: Record<string, unknown> = { error: "Client not found" };
      if (debug) {
        body._debug = { clientQueryError: clientError?.message ?? null };
      }
      return NextResponse.json(body, { status: 404 });
    }

    return NextResponse.json(clientData);
  } catch (error) {
    console.error("Error fetching client:", error);
    return NextResponse.json({ error: "Failed to fetch client" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await context.params;
    const body = await request.json();
    const { name, email, google_ads_customer_id } = body;

    // Verify agency
    const { data: agencyData, error: agencyError } = await supabaseAdmin
      .from("agencies")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (agencyError || !agencyData) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    }

    const { data: updatedClient, error: updateError } = await supabaseAdmin
      .from("clients")
      .update({ name, email, google_ads_customer_id })
      .eq("id", id)
      .eq("agency_id", agencyData.id)
      .select()
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json(updatedClient);
  } catch (err) {
    console.error("Error updating client:", err);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}
