import { supabaseAdmin } from "./supabase/admin.ts";

/**
 * An agency by its address (/agencies/[slug]), with only the fields a page may
 * show before anything else is known: its id and its name. Never the Google
 * Ads refresh token or connection detail.
 *
 * Server only. It reads with the service role, so a page that goes on to show
 * tenant data must check the viewer's profile itself; see the README.
 */
export async function findAgency(slug: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabaseAdmin
    .from("agencies")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();

  return data;
}
