import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiAuth } from "@/lib/api-auth";
import { NextResponse } from "next/server";

export async function GET() {
  const { response: authError } = await requireApiAuth(["master_admin"]);
  if (authError) return authError;

  try {
    // Use admin client to bypass RLS and fetch all agencies
    const { data, error } = await supabaseAdmin
      .from("agencies")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
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
    const { name, slug, google_ads_manager_customer_id } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Agency name and slug are required" },
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
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(newAgency, { status: 201 });
  } catch (error) {
    console.error("Error creating agency:", error);
    return NextResponse.json(
      { error: "Failed to create agency" },
      { status: 500 }
    );
  }
}
