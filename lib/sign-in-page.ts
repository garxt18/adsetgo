/**
 * The sign-in screens, and what each says when Google sign-in did not work.
 *
 * The Google callback sends people back to the screen they started from, so
 * the page they return to is checked against the real sign-in screens (the
 * three sign-in pages and agency sign-up): anything else (another site,
 * another page of ours) falls back to /login.
 */

const SIGN_IN_PAGES = /^\/(login|signup|agencies\/[a-z0-9-]+\/(login|client-login))$/;

export function signInPage(from: string | null | undefined): string {
  return from && SIGN_IN_PAGES.test(from) ? from : "/login";
}

export type SignInError = "not_invited" | "not_set_up" | "failed" | "signup_closed";

export const SIGN_IN_ERRORS: Record<SignInError, string> = {
  not_invited:
    "That Google account has not been invited. Choose the Google account for the address you were invited with, or ask for an invitation.",
  not_set_up: "This account is not set up yet. Ask whoever invited you to check it.",
  failed: "Google sign-in did not finish. Try again.",
  signup_closed: "New agency sign-ups are closed at the moment.",
};

/** The message for an `?error=` value, or nothing for an unknown one. */
export function signInError(value: string | string[] | undefined): string {
  return typeof value === "string" && Object.hasOwn(SIGN_IN_ERRORS, value) ? SIGN_IN_ERRORS[value as SignInError] : "";
}
