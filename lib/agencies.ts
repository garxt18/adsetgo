import { supabaseAdmin } from "./supabase/admin.ts";

/** What pages and routes may know about an agency. Never its refresh token. */
export type Agency = {
  id: string;
  name: string;
  slug: string;
  google_ads_manager_customer_id: string | null;
  google_ads_connection_status: string | null;
};

/**
 * An agency by its address (/agencies/[slug]).
 *
 * The one place an agency is looked up by slug, for pages and API routes
 * alike. It deliberately never selects `google_ads_refresh_token`: code that
 * needs the token (minting an access token) reads it itself, so the credential
 * cannot ride along into a page or a response by accident.
 *
 * Server only. It reads with the service role, so the caller must still check
 * that the viewer may see this agency; API routes do that through
 * requireAgency in lib/api-auth.ts.
 */
export async function findAgency(slug: string): Promise<Agency | null> {
  const { data } = await supabaseAdmin
    .from("agencies")
    .select("id, name, slug, google_ads_manager_customer_id, google_ads_connection_status")
    .eq("slug", slug)
    .maybeSingle();

  return data;
}
