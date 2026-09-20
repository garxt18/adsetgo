import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      email,
      password,
      clientId,
      agencySlug,
    } = body;

    // Validate input
    if (!email || !password || !clientId || !agencySlug) {
      return NextResponse.json(
        { error: "Missing required fields: email, password, clientId, agencySlug" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Verify client exists and get their agency
    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("id, agency_id, agencies(slug, id)")
      .eq("id", clientId)
      .maybeSingle();

    if (clientError || !client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    // Verify agency slug matches
    const agencyData = client.agencies as unknown as { id: string; slug: string } | null;
    if (!agencyData || agencyData.slug !== agencySlug) {
      return NextResponse.json(
        { error: "Invalid agency or client" },
        { status: 403 }
      );
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
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

    // Create profile with client role
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: authData.user.id,
        email: email,
        role: "client",
        agency_id: agencyData.id,
        client_id: clientId,
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

    // Link the client record to the auth user
    const { error: updateError } = await supabaseAdmin
      .from("clients")
      .update({
        auth_user_id: authData.user.id,
        status: "active",
      })
      .eq("id", clientId);

    if (updateError) {
      console.error("Error linking client to auth user:", updateError);
      // Don't fail here, the user was created successfully
    }

    return NextResponse.json(
      {
        success: true,
        user: {
          id: authData.user.id,
          email: authData.user.email,
          clientId,
          agencySlug,
        },
        message: "Client account created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in client signup:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
