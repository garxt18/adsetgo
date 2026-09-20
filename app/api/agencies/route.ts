import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function GET() {
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
        google_ads_connection_status: google_ads_manager_customer_id ? "connected" : "pending",
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
