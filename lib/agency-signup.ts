/**
 * The rules for an agency creating its own workspace.
 *
 * Pure, so the sign-up form can show the same answer the server will give,
 * and both are tested together.
 */

import { sanitizeAgencySlug } from "./google-ads/format.ts";

/**
 * Addresses that are, or could become, pages of the app itself. /agencies/new
 * is the platform admin's "create an agency" page, so an agency at that
 * address could never be reached; the rest are kept free for the same reason.
 */
const RESERVED = new Set([
  "new",
  "admin",
  "api",
  "app",
  "auth",
  "dashboard",
  "login",
  "signup",
  "settings",
  "adsetgo",
  "support",
  "help",
]);

const MAX_NAME = 80;

export type AgencySignup = { ok: true; name: string; slug: string } | { ok: false; error: string };

/** The agency's name and web address, checked and tidied, or why they cannot be used. */
export function checkAgencySignup(input: { name?: unknown; slug?: unknown }): AgencySignup {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  const wanted = typeof input.slug === "string" && input.slug.trim() ? input.slug : name;
  const slug = sanitizeAgencySlug(wanted);

  if (name.length < 2) return { ok: false, error: "Enter your agency's name." };
  if (name.length > MAX_NAME) return { ok: false, error: `Keep the name under ${MAX_NAME} characters.` };
  if (slug.length < 3) return { ok: false, error: "The web address needs at least 3 letters or numbers." };
  if (RESERVED.has(slug)) return { ok: false, error: "That web address is reserved. Choose another." };

  return { ok: true, name, slug };
}

/**
 * Whether agencies may create their own workspace. On unless
 * AGENCY_SIGNUP_CLOSED=1 is set: a switch to close the door at once, without
 * a code change, if sign-ups are ever abused.
 */
export function agencySignupOpen(env: Record<string, string | undefined> = process.env): boolean {
  return env.AGENCY_SIGNUP_CLOSED?.trim() !== "1";
}
