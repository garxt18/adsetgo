import { NextResponse } from "next/server";

import { findAgency, type Agency } from "./agencies.ts";
import { normalizeGoogleAdsCustomerId } from "./google-ads/format.ts";
import { supabaseAdmin } from "./supabase/admin.ts";
import { getCurrentProfile, type AppProfile, type AppRole } from "./supabase/server.ts";

export type ApiAuthSuccess = { profile: AppProfile; response: null };
export type ApiAuthFailure = { profile: null; response: NextResponse };
export type ApiAuthResult = ApiAuthSuccess | ApiAuthFailure;

/**
 * Resolve the caller's profile for an API route, optionally restricting to a set
 * of roles. Routes call this first and return `response` when it is non-null.
 *
 * The proxy (proxy.ts) matcher does not cover /api/*, so every route is responsible for
 * its own authorization; there is no ambient protection to fall back on.
 */
export async function requireApiAuth(
  allowedRoles?: AppRole[]
): Promise<ApiAuthResult> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      profile: null,
      response: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      ),
    };
  }

  if (allowedRoles && !allowedRoles.includes(profile.role as AppRole)) {
    return {
      profile: null,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return { profile, response: null };
}

/**
 * Whether this person may act for an agency: a master admin for any agency, an
 * agency admin only for their own. Clients never manage agencies. Pages use
 * this directly; API routes go through requireAgencyAccess below.
 */
export function canManageAgency(profile: AppProfile, agencyId: string): boolean {
  return (
    profile.role === "master_admin" ||
    (profile.role === "agency_admin" && profile.agency_id === agencyId)
  );
}

/** The API form of canManageAgency: null when allowed, else the 403 to return. */
export function requireAgencyAccess(
  profile: AppProfile,
  agencyId: string
): NextResponse | null {
  if (canManageAgency(profile, agencyId)) {
    return null;
  }

  return NextResponse.json(
    { error: "You do not have access to this agency." },
    { status: 403 }
  );
}

/**
 * The caller and the agency named in a route's URL, once both checks pass.
 *
 * Every agency route starts the same way -- who is asking, which agency, may
 * they act for it -- and seven routes used to write that out themselves. The
 * two lookups run at the same time, and the answers come in the order that
 * gives away least: 401 or 403 for the caller before anything is said about
 * the agency, then 404 if there is no such agency, then 403 if it is not
 * theirs.
 */
export async function requireAgency(
  slug: string,
  allowedRoles: AppRole[]
): Promise<
  | { profile: AppProfile; agency: Agency; response: null }
  | { profile: null; agency: null; response: NextResponse }
> {
  const [auth, agency] = await Promise.all([requireApiAuth(allowedRoles), findAgency(slug)]);

  if (auth.response) {
    return { profile: null, agency: null, response: auth.response };
  }

  if (!agency) {
    return {
      profile: null,
      agency: null,
      response: NextResponse.json({ error: "Agency not found." }, { status: 404 }),
    };
  }

  const denied = requireAgencyAccess(auth.profile, agency.id);
  if (denied) {
    return { profile: null, agency: null, response: denied };
  }

  return { profile: auth.profile, agency, response: null };
}

/**
 * Confirm the caller may read a given client record. Master admins see all,
 * agency admins see clients inside their agency, and a client sees only itself.
 */
export function requireClientAccess(
  profile: AppProfile,
  client: { id: string; agency_id: string }
): NextResponse | null {
  if (canManageAgency(profile, client.agency_id)) {
    return null;
  }

  if (profile.role === "client" && profile.client_id === client.id) {
    return null;
  }

  return NextResponse.json(
    { error: "You do not have access to this client." },
    { status: 403 }
  );
}

/** The client a report is about, with the ids a Google Ads query needs. */
export type ReportClient = {
  id: string;
  name: string;
  email: string;
  agencyId: string;
  agencyName: string;
  /** Ten digits, or "" when no account is linked yet. */
  customerId: string;
  /** Ten digits, or "" when the agency has not recorded its manager account. */
  managerCustomerId: string;
};

/**
 * The client a report request is about, once the caller may see it. A client
 * always gets their own record, whatever id they send; agency staff name one.
 * The report and the calls report both start here.
 */
export async function requireReportClient(
  requestedClientId: string | null
): Promise<{ client: ReportClient; response: null } | { client: null; response: NextResponse }> {
  const fail = (response: NextResponse) => ({ client: null, response });

  const { profile, response } = await requireApiAuth();
  if (response) return fail(response);

  const clientId = profile.role === "client" ? profile.client_id : requestedClientId;
  if (!clientId) return fail(NextResponse.json({ error: "clientId is required" }, { status: 400 }));

  // Only the columns a report needs: the agency row also holds the Google
  // refresh token, which has no reason to be loaded here.
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select(
      "id, name, email, agency_id, google_ads_customer_id, agencies:agency_id(name, google_ads_manager_customer_id)"
    )
    .eq("id", clientId)
    .maybeSingle();

  if (!client) return fail(NextResponse.json({ error: "Client not found." }, { status: 404 }));

  // Denies unless a rule allows.
  const denied = requireClientAccess(profile, client);
  if (denied) return fail(denied);

  // A to-one join arrives as one object; without generated database types the
  // client library cannot know that and types it as a list.
  const agency = client.agencies as unknown as {
    name: string;
    google_ads_manager_customer_id: string | null;
  } | null;

  return {
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      agencyId: client.agency_id,
      agencyName: agency?.name ?? "",
      customerId: normalizeGoogleAdsCustomerId(client.google_ads_customer_id),
      managerCustomerId: normalizeGoogleAdsCustomerId(agency?.google_ads_manager_customer_id),
    },
    response: null,
  };
}
