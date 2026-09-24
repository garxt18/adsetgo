import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Dev-only: create a master_admin user + profile
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not allowed in production" }, { status: 403 });
  }

  // Sourced from the environment so no working credential sits in source.
  const email = process.env.DEV_ADMIN_EMAIL;
  const password = process.env.DEV_ADMIN_PASSWORD;

  if (!email || !password) {
    return NextResponse.json(
      {
        error:
          "Set DEV_ADMIN_EMAIL and DEV_ADMIN_PASSWORD in .env.local to use this route.",
      },
      { status: 400 }
    );
  }

  try {
    // Create the auth user via service role
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      // If user exists, attempt to find by email
      const { data: existingProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id,email,role")
        .eq("email", email)
        .limit(1);

      if (existingProfiles && existingProfiles.length > 0) {
        return NextResponse.json({
          message: "Profile already exists",
          profile: existingProfiles[0],
          createError: createError.message,
        });
      }

      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    const user = userData.user;

    if (!user || !user.id) {
      return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }

    // Insert profile
    const profilePayload = {
      id: user.id,
      email,
      role: "master_admin",
      agency_id: null,
    };

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(profilePayload);

    if (profileError) {
      return NextResponse.json(
        { error: "User created but failed to create profile", detail: profileError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, userId: user.id, email });
  } catch (err: unknown) {
    console.error("create-master-admin error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
