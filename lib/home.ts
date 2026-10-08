import { supabaseAdmin } from "./supabase/admin.ts";
import type { AppProfile } from "./supabase/server.ts";

/**
 * Where a signed-in person belongs: the platform dashboard, their agency's
 * workspace, or their own client report. The profile decides, never the URL
 * someone arrived on. Null when the profile has nowhere to go.
 *
 * Both ways of arriving use it -- the Google sign-in callback and the
 * password screen (through /api/auth/home) -- so they cannot disagree.
 */
export async function homeFor(profile: AppProfile): Promise<string | null> {
  if (profile.role === "master_admin") return "/dashboard";
  if (!profile.agency_id) return null;

  const { data: agency } = await supabaseAdmin
    .from("agencies")
    .select("slug")
    .eq("id", profile.agency_id)
    .maybeSingle();

  if (!agency) return null;

  if (profile.role === "client" && profile.client_id) {
    // Arriving here signed in means the client has accepted their invitation,
    // so their record stops saying "invited". Only the caller's own record,
    // and only once.
    await supabaseAdmin
      .from("clients")
      .update({ status: "active" })
      .eq("id", profile.client_id)
      .eq("agency_id", profile.agency_id)
      .eq("status", "invited");
  }

  return profile.role === "client"
    ? `/agencies/${agency.slug}/client-dashboard`
    : `/agencies/${agency.slug}/dashboard`;
}
