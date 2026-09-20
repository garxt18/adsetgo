import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
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

    return NextResponse.json(newClient);
  } catch (error) {
    console.error("Error creating client:", error);
    return NextResponse.json(
      { error: "Failed to create client" },
      { status: 500 }
    );
  }
}
