/**
 * Display formatting for figures shown to clients and agencies.
 *
 * Kept apart from lib/google-ads/format.ts, which normalises Google Ads
 * identifiers; this one is about how a number reads on screen.
 */

/**
 * The platform reports in Indian rupees, grouped the Indian way
 * (1,89,449 rather than 189,449), which is what the connected accounts use.
 * Currency is a parameter so an agency reporting in another one later needs a
 * value passed in, not a search through the codebase.
 */
export const DEFAULT_CURRENCY = "INR";

export function formatCurrency(value: number, currency = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(
    Number.isFinite(value) ? Math.round(value) : 0
  );
}

export function formatPercent(value: number, digits = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(digits)}%`;
}
