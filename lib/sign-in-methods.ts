/**
 * Which ways of signing in each role may use.
 *
 * Agencies and clients sign in with Google only. Hiding the password form is
 * not enough on its own: Supabase's sign-in API is public, so anyone who still
 * knew an old password could call it directly and get a valid session. The
 * session records how it was made (`amr`), and the server refuses an agency
 * or client session that was not made with Google.
 *
 * The platform admin keeps a password as a backup, so that a problem with one
 * Google account can never lock the owner out of the whole platform.
 */

import type { AppRole } from "./supabase/server.ts";

/** Supabase's `amr` claim: plain method names, or entries with a timestamp. */
export type AuthMethods = ReadonlyArray<string | { method?: string }> | undefined | null;

function methodsOf(amr: AuthMethods): string[] {
  return (amr ?? []).map((entry) => (typeof entry === "string" ? entry : entry.method ?? ""));
}

/**
 * Whether a session made by these methods may act as this role.
 *
 * In local development a one-time sign-in link ("otp"/"magiclink") is also
 * accepted, so the app can be tested as an agency or a client without anyone's
 * Google password. Production never accepts it.
 */
export function signInAllowed(role: AppRole | null, amr: AuthMethods, isDevelopment: boolean): boolean {
  if (role === "master_admin") return true;

  const methods = methodsOf(amr);
  if (methods.includes("oauth")) return true;

  return isDevelopment && (methods.includes("otp") || methods.includes("magiclink"));
}
