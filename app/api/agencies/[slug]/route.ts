import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  // Deleting an agency cascades to its clients, so it stays master-admin only.
  const { response: authError } = await requireApiAuth(["master_admin"]);
  if (authError) return authError;

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
