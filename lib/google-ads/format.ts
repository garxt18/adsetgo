/**
 * Pure string helpers for Google Ads identifiers and agency slugs.
 *
 * This module deliberately has no imports: it is pulled into browser bundles by
 * client components, so it must never reach the Supabase clients (and therefore
 * never the service-role key) through a transitive import.
 */

export function normalizeGoogleAdsCustomerId(value?: string | null): string {
  if (!value) {
    return "";
  }

  return value.replace(/[^\d]/g, "");
}

/**
 * A customer id as it is stored: exactly ten digits, or null when the input
 * is not one. Stored one way only, so "358-312-5339" and "3583125339" are the
 * same account to the database's one-client-per-account rule.
 */
export function parseGoogleAdsCustomerId(value?: string | null): string | null {
  const digits = normalizeGoogleAdsCustomerId(value);
  return digits.length === 10 ? digits : null;
}

export function formatGoogleAdsCustomerId(value?: string | null): string {
  const digits = normalizeGoogleAdsCustomerId(value);
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits || "N/A";
}

export function sanitizeAgencySlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
