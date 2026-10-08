import { supabaseAdmin } from "./supabase/admin.ts";

/**
 * Invitations for agency admins and clients.
 *
 * Accounts are never self-served: the app creates the login for the invited
 * address, with its role, before that person ever arrives. They then sign in
 * with the Google account for that address, and Google attaches to the login
 * because the addresses match. A Google account for any other address finds no
 * login with a role and is turned away (app/auth/callback/route.ts).
 *
 * Nothing is emailed and no token is handed out: what the inviter shares is the
 * ordinary sign-in page, which is useless to anyone but the invited address.
 */

export type InviteRole = "agency_admin" | "client";

export type InviteResult =
  | { ok: true; signInLink: string; userId: string }
  | { ok: false; error: string; status: number };

/**
 * The origin to send the invited person back to. Taken from the request so the
 * link works on localhost, a preview deployment and production alike.
 */
export function resolveAppOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const headers = request.headers;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto =
    headers.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");

  if (host) {
    return `${proto}://${host.replace(/^0\.0\.0\.0/, "localhost")}`;
  }

  return new URL(request.url).origin;
}

/**
 * Create the login for `email`, with its role, and return the sign-in page to
 * send them. The profile carries the role, so an invited person cannot choose
 * what they become.
 *
 * The address is marked confirmed and the login has no password: Google only
 * attaches to a login whose address is confirmed, and without a password the
 * only way in is the Google account for that address.
 */
export async function createInvite({
  email,
  role,
  agencyId,
  agencySlug,
  clientId,
  origin,
}: {
  email: string;
  role: InviteRole;
  agencyId: string;
  agencySlug: string;
  clientId?: string;
  origin: string;
}): Promise<InviteResult> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    email_confirm: true,
  });

  if (error || !data?.user) {
    const message = error?.message ?? "Could not create the invitation.";

    // An address that already has a login is the common case here, and it must
    // not silently attach a second role to that person.
    const status = /already|exists|registered/i.test(message) ? 409 : 500;

    return { ok: false, error: message, status };
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: data.user.id,
    email: data.user.email,
    role,
    agency_id: agencyId,
    client_id: clientId ?? null,
  });

  if (profileError) {
    // Without a profile the account has no role, so leave nothing behind.
    await supabaseAdmin.auth.admin.deleteUser(data.user.id);

    return { ok: false, error: profileError.message, status: 500 };
  }

  const page = role === "client" ? "client-login" : "login";

  return { ok: true, signInLink: `${origin}/agencies/${agencySlug}/${page}`, userId: data.user.id };
}

/**
 * The logins that belong to an agency, or to one client of it.
 *
 * Read before the agency or client row is deleted: deleting an agency sets
 * its people's `agency_id` to null, after which nothing says whose they were.
 * Only agency admins and clients are ever returned, never a platform admin.
 */
export async function loginsBelongingTo({
  agencyId,
  clientId,
}: {
  agencyId: string;
  clientId?: string;
}): Promise<string[]> {
  let query = supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("agency_id", agencyId)
    .in("role", clientId ? ["client"] : ["agency_admin", "client"]);

  if (clientId) query = query.eq("client_id", clientId);

  const { data } = await query;
  return (data ?? []).map((profile) => profile.id);
}

/**
 * Delete logins whose agency or client has been removed. Their profiles go
 * with them (profiles.id cascades from auth.users).
 *
 * Left behind, such a login could not reach any data, but it kept its email
 * address taken, so the same person could never be invited again. Never
 * throws: the removal it follows has already happened, so a failure here is
 * reported in the count rather than undoing it.
 */
export async function deleteLogins(userIds: string[]): Promise<{ removed: number; failed: number }> {
  const results = await Promise.all(
    userIds.map((id) => supabaseAdmin.auth.admin.deleteUser(id))
  );

  // Already gone counts as removed: that is the state being asked for.
  const failed = results.filter(({ error }) => error && error.status !== 404);
  failed.forEach(({ error }) => console.error("Could not delete login:", error));

  return { removed: userIds.length - failed.length, failed: failed.length };
}
