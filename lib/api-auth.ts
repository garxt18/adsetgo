import { NextResponse } from "next/server";

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
