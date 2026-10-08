import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseConfig } from "./env.ts";
import { supabaseAdmin } from "./admin.ts";
import { signInAllowed } from "../sign-in-methods.ts";

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
  // A real signed-in session always wins. The development shortcut used to be
  // checked first, and its cookie lasts a day, so signing in as a client on the
  // same browser still got platform-admin answers from every API route --
  // which hid exactly the permission bugs you sign in as a client to find.
  //
  // getClaims checks the session's signature on this server, against signing
  // keys cached for ten minutes, where getUser asked Supabase on every call.
  // Whether the person still has access is not taken from the token: the
  // profile is read fresh below, so a removed account loses access at once.
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (userId) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    // Agencies and clients must have signed in with Google. A session made
    // any other way (an old password, a reset link) is treated as signed out,
    // so it reaches nothing. See lib/sign-in-methods.ts.
    if (
      profile &&
      !signInAllowed((profile as AppProfile).role, data?.claims.amr, process.env.NODE_ENV !== "production")
    ) {
      return null;
    }

    return (profile as AppProfile | null) ?? null;
  }

  const cookieStore = await cookies();
  const isDevEnvironment = process.env.NODE_ENV !== "production";
  const devAdminOverride = isDevEnvironment
    ? cookieStore.get("dev_admin_override")?.value
    : undefined;

  if (!devAdminOverride || devAdminOverride !== DEV_ADMIN_EMAIL) {
    return null;
  }

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

/**
 * The signed-in person before they have a profile: someone who has just
 * signed in with Google to create their own agency. Everything else asks
 * getCurrentProfile, which answers only for people with a role.
 */
export async function getSessionUser(): Promise<{
  id: string;
  email: string;
  /** Whether this session was made with Google (or, locally, a one-time link). */
  viaGoogle: boolean;
} | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || typeof claims.email !== "string") return null;

  return {
    id: claims.sub,
    email: claims.email.toLowerCase(),
    viaGoogle: signInAllowed("agency_admin", claims.amr, process.env.NODE_ENV !== "production"),
  };
}
