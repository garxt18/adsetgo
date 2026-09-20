import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseConfig } from "./supabase-env";
import { supabaseAdmin } from "./supabase-admin";

export type AppRole = "master_admin" | "agency_admin" | "client";

export type AppProfile = {
  id: string;
  email: string | null;
  role: AppRole | null;
  agency_id: string | null;
  client_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseConfig("public");

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // ignore cookie write failures in the server environment when not available
        }
      },
    },
  });
}

// Local-only escape hatch. Never honoured in production, and the account it maps
// to comes from the environment so no credential lives in source. When unset,
// the override simply does not apply.
const DEV_ADMIN_EMAIL = process.env.DEV_ADMIN_EMAIL ?? "";

export async function getCurrentProfile(): Promise<AppProfile | null> {
  const cookieStore = await cookies();
  const isDevEnvironment = process.env.NODE_ENV !== "production";
  const devAdminOverride = isDevEnvironment
    ? cookieStore.get("dev_admin_override")?.value
    : undefined;

  if (devAdminOverride && devAdminOverride === DEV_ADMIN_EMAIL) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("email", devAdminOverride)
      .maybeSingle();

    if (profile) {
      return profile as AppProfile;
    }

    return {
      id: "dev-admin",
      email: devAdminOverride,
      role: "master_admin",
      agency_id: null,
      client_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (profile as AppProfile | null) ?? null;
}

export async function requireRole(allowedRoles: AppRole[]) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return { profile: null, authorized: false, reason: "unauthenticated" };
  }

  if (!allowedRoles.includes(profile.role as AppRole)) {
    return { profile, authorized: false, reason: "forbidden" };
  }

  return { profile, authorized: true, reason: null };
}
