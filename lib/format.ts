/**
 * Display formatting for figures shown to clients and agencies.
 *
 * Kept apart from lib/google-ads/format.ts, which normalises Google Ads
 * identifiers; this one is about how a number reads on screen.
 */

/**
 * Each client is reported in their own Google Ads account's currency
 * (customer.currency_code): a UK client in pounds, an Indian one in rupees.
 * The rupee is only the fallback for figures with no account behind them.
 */
export const DEFAULT_CURRENCY = "INR";

/**
 * Rupee accounts read the Indian way (1,89,449); every other currency the
 * international way (189,449), so a UK client never sees "£1,89,449".
 */
function localeFor(currency: string): string {
  return currency === "INR" ? "en-IN" : "en-GB";
}

export function formatCurrency(value: number, currency = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat(localeFor(currency), {
    style: "currency",
    currency,
    // "$" rather than "US$", "£" rather than "GBP": the symbol people write.
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
  }).format(Number.isFinite(value) ? value : 0);
}

/** A count (clicks, conversions), grouped the way its account's currency is. */
export function formatNumber(value: number, currency = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat(localeFor(currency)).format(
    Number.isFinite(value) ? Math.round(value) : 0
  );
}

/** Amounts in several currencies, largest first: "₹3,543 · £1,279", or "—" if none. */
export function formatAmounts(amounts: Array<{ value: number; currency: string }>): string {
  return amounts.length ? amounts.map((a) => formatCurrency(a.value, a.currency)).join(" · ") : "—";
}

export function formatPercent(value: number, digits = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(digits)}%`;
}
