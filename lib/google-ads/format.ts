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
