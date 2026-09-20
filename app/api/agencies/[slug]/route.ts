import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Find agency by slug
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

    // Delete agency by id
    const { error } = await supabaseAdmin
      .from("agencies")
      .delete()
      .eq("id", agencyData.id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting agency by slug:", error);
    return NextResponse.json(
      { error: "Failed to delete agency" },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const { data: agencyDataRaw, error: agencyError } = await supabaseAdmin
      .from("agencies")
      .select("id, name, slug, google_ads_manager_customer_id, google_ads_connection_status, google_ads_refresh_token")
      .eq("slug", slug)
      .maybeSingle();

    // Mask refresh token for safe client-side display
    const agencyData = agencyDataRaw
      ? {
          id: agencyDataRaw.id,
          name: agencyDataRaw.name,
          slug: agencyDataRaw.slug,
          google_ads_manager_customer_id: agencyDataRaw.google_ads_manager_customer_id,
          google_ads_connection_status: agencyDataRaw.google_ads_connection_status,
          google_ads_refresh_token_masked: agencyDataRaw.google_ads_refresh_token
            ? `***${String(agencyDataRaw.google_ads_refresh_token).slice(-6)}`
            : null,
        }
      : null;

    if (agencyError) {
      return NextResponse.json({ error: agencyError.message }, { status: 500 });
    }

    if (!agencyData) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    }

    return NextResponse.json(agencyData);
  } catch (err) {
    console.error("Error fetching agency by slug:", err);
    return NextResponse.json({ error: "Failed to fetch agency" }, { status: 500 });
  }
}
