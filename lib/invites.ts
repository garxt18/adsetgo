import { supabaseAdmin } from "./supabase/admin.ts";

/**
 * Invitations for agency admins and clients.
 *
 * Accounts are never self-served: the app creates the account and hands back a
 * single-use link for the intended address. The alternative -- a public signup
 * endpoint keyed on the agency id and slug -- let anyone who read those public
 * values register themselves as an agency's admin, or bind their own login to
 * an existing client record.
 *
 * Supabase issues and expires the invite token, so no token is stored here.
 */

export type InviteRole = "agency_admin" | "client";

export type InviteResult =
  | { ok: true; inviteLink: string; userId: string }
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
 * Create the account for `email` and return a single-use link that lets exactly
 * that address set a password. The profile carries the role, so an invited
 * person cannot choose what they become.
 */
export async function createInvite({
  email,
  role,
  agencyId,
  clientId,
  origin,
}: {
  email: string;
  role: InviteRole;
  agencyId: string;
  clientId?: string;
  origin: string;
}): Promise<InviteResult> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${origin}/invite/accept` },
  });

  if (error || !data?.user || !data.properties?.hashed_token) {
    const message = error?.message ?? "Could not create the invitation.";

    // An address that already has a login is the common case here, and it must
    // not silently attach a second role to that person.
    const status = /already|exists|registered/i.test(message) ? 409 : 500;

    return { ok: false, error: message, status };
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: data.user.id,
    email,
    role,
    agency_id: agencyId,
    client_id: clientId ?? null,
  });

  if (profileError) {
    // Without a profile the account has no role, so leave nothing behind.
    await supabaseAdmin.auth.admin.deleteUser(data.user.id);

    return { ok: false, error: profileError.message, status: 500 };
  }

  // Supabase's own action_link hands the session back in the URL fragment
  // (implicit flow), which the PKCE browser client never reads -- the invited
  // person would be told their link was invalid. Pointing at our own page with
  // the token hash lets it complete the sign-in through verifyOtp instead.
  const inviteLink = `${origin}/invite/accept?token_hash=${encodeURIComponent(
    data.properties.hashed_token
  )}&type=invite`;

  return { ok: true, inviteLink, userId: data.user.id };
}

/**
 * A single-use link that lets an existing account choose a new password.
 *
 * Issued by whoever manages the account -- an agency for its clients, the
 * platform admin for agency owners -- and handed over directly, so a person
 * who forgot their password is not stuck waiting on email delivery. Supabase's
 * built-in mailer is rate-limited and, without custom SMTP, may not deliver to
 * arbitrary addresses at all.
 *
 * The address is read from the auth account itself, not from the client
 * record: an agency can edit a client's email in the directory, but that does
 * not change the address they sign in with.
 */
export async function createAccessLink({
  userId,
  origin,
}: {
  userId: string;
  origin: string;
}): Promise<{ ok: true; link: string; email: string } | { ok: false; error: string; status: number }> {
  const { data: account, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = account?.user?.email;

  if (lookupError || !email) {
    return { ok: false, error: "This person does not have a sign-in account yet.", status: 404 };
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/reset-password` },
  });

  if (error || !data?.properties?.hashed_token) {
    return { ok: false, error: error?.message ?? "The link could not be created.", status: 500 };
  }

  const link = `${origin}/reset-password?token_hash=${encodeURIComponent(
    data.properties.hashed_token
  )}&type=recovery`;

  return { ok: true, link, email };
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
