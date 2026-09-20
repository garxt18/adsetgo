import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const cookie = request.headers.get("cookie") || "";

    // Only allow this in dev when the dev_admin_override cookie is present
    if (!cookie.includes("dev_admin_override=")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, slug, google_ads_manager_customer_id } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data: newAgency, error } = await supabaseAdmin
      .from("agencies")
      .insert({
        name,
        slug,
        google_ads_manager_customer_id,
        google_ads_connection_status: google_ads_manager_customer_id ? "connected" : "pending",
      })
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(newAgency);
  } catch (err) {
    console.error("Dev create agency error:", err);
    return NextResponse.json({ error: "Failed to create agency" }, { status: 500 });
  }
}
