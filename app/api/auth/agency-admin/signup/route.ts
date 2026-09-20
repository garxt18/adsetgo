import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      email,
      password,
      agencyId,
      agencySlug,
      firstName,
      lastName,
    } = body;

    // Validate input
    if (!email || !password || !agencyId || !agencySlug) {
      return NextResponse.json(
        { error: "Missing required fields: email, password, agencyId, agencySlug" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Verify agency exists
    const { data: agency, error: agencyError } = await supabaseAdmin
      .from("agencies")
      .select("id")
      .eq("id", agencyId)
      .eq("slug", agencySlug)
      .maybeSingle();

    if (agencyError || !agency) {
      return NextResponse.json(
        { error: "Agency not found" },
        { status: 404 }
      );
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
      },
    });

    if (authError) {
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 }
      );
    }

    // Create profile with agency_admin role
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: authData.user.id,
        email: email,
        role: "agency_admin",
        agency_id: agencyId,
      })
      .select()
      .maybeSingle();

    if (profileError) {
      // Clean up the auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: profileError.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        user: {
          id: authData.user.id,
          email: authData.user.email,
          agencyId,
          agencySlug,
        },
        message: "Agency admin account created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in agency admin signup:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
