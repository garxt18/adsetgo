/**
 * Turns Google Ads ad and keyword rows into what the Ads tab shows.
 *
 * Pure, like report.ts and calls.ts: live and sample rows go through the same
 * arithmetic, and it is tested directly.
 */

import type { AdRow, KeywordRow } from "./auth.ts";
import { periodOf, type ResolvedRange } from "./date-range.ts";
import { summarize } from "./report.ts";

/** How many keywords the Ads tab lists: the best, not every one bid on. */
export const TOP_KEYWORDS = 25;

/** One ad's or keyword's figures, worked out exactly as a campaign's are. */
function figures(metrics: AdRow["metrics"]) {
  const { impressions, clicks, cost, conversions, ctr, costPerConversion } = summarize([{ metrics }]);
  return { impressions, clicks, cost, conversions, ctr, costPerConversion };
}

/** For ads that carry no headline of their own, such as video and image ads. */
const AD_TYPES: Record<string, string> = {
  VIDEO_AD: "Video ad",
  VIDEO_RESPONSIVE_AD: "Video ad",
  IMAGE_AD: "Image ad",
  RESPONSIVE_DISPLAY_AD: "Display ad",
  CALL_AD: "Call ad",
  APP_AD: "App ad",
  SHOPPING_PRODUCT_AD: "Shopping ad",
};

const PIN_ORDER: Record<string, number> = { HEADLINE_1: 0, HEADLINE_2: 1, HEADLINE_3: 2 };

/**
 * A headline as people see it rather than as it is written. Google fills in
 * insertion codes when it shows the ad: "{KeyWord:Cheap Flights}" shows the
 * search or, failing that, its default text; "{LOCATION(City)}" shows the
 * reader's city. Codes are kept as the default text or a [city]-style marker.
 */
export function readableHeadline(text: string): string {
  return text
    .replace(/\{LOCATION\((\w+)\)\}/gi, (_, place: string) => `[${place.toLowerCase()}]`)
    .replace(/\{[^{}:]+:([^{}]*)\}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * An ad as a reader would recognise it: its first three headlines, pinned
 * ones in their pinned places. Google mixes a responsive ad's headlines
 * differently each time, so this is how it usually reads, not a fixed text.
 */
export function adHeadline(ad: NonNullable<AdRow["adGroupAd"]>["ad"]): string {
  const assets = ad?.responsiveSearchAd?.headlines ?? ad?.responsiveDisplayAd?.headlines ?? [];
  const pinned = [...assets].sort((a, b) => (PIN_ORDER[a.pinnedField ?? ""] ?? 3) - (PIN_ORDER[b.pinnedField ?? ""] ?? 3));
  const fromAssets = pinned.map((asset) => readableHeadline(asset.text ?? "")).filter(Boolean);
  const fromText = [ad?.expandedTextAd?.headlinePart1, ad?.expandedTextAd?.headlinePart2]
    .map((text) => readableHeadline(text ?? ""))
    .filter(Boolean);
  const parts = fromAssets.length > 0 ? fromAssets.slice(0, 3) : fromText;

  if (parts.length > 0) return parts.join(" | ");
  return ad?.name?.trim() || AD_TYPES[ad?.type ?? ""] || "Ad";
}

const MATCH_TYPES: Record<string, string> = { EXACT: "Exact", PHRASE: "Phrase", BROAD: "Broad" };

export function adLines(rows: AdRow[]) {
  return rows.map((row) => ({
    // An ad id is only unique within its ad group.
    id: `${row.adGroup?.id ?? ""}~${row.adGroupAd?.ad?.id ?? ""}`,
    headline: adHeadline(row.adGroupAd?.ad),
    status: row.adGroupAd?.status ?? "ENABLED",
    campaignId: String(row.campaign?.id ?? ""),
    campaign: row.campaign?.name ?? "Campaign",
    adGroup: row.adGroup?.name ?? "Ad group",
    ...figures(row.metrics),
  }));
}

export function keywordLines(rows: KeywordRow[]) {
  return rows.map((row) => ({
    id: `${row.adGroup?.id ?? ""}~${row.adGroupCriterion?.criterionId ?? ""}`,
    text: row.adGroupCriterion?.keyword?.text ?? "Keyword",
    matchType: MATCH_TYPES[row.adGroupCriterion?.keyword?.matchType ?? ""] ?? "",
    status: row.adGroupCriterion?.status ?? "ENABLED",
    campaign: row.campaign?.name ?? "Campaign",
    adGroup: row.adGroup?.name ?? "Ad group",
    ...figures(row.metrics),
  }));
}

export type AdLine = ReturnType<typeof adLines>[number];
export type KeywordLine = ReturnType<typeof keywordLines>[number];

/** What the ad table can be ordered by; every order ends on results. */
export type AdOrder = "conversions" | "impressions" | "clicks";

type Ranked = { conversions: number; impressions: number; clicks: number; cost: number };

/**
 * Highest first by the chosen figure. Ties go to more conversions, then more
 * clicks, then the cheaper, so the order never depends on Google's row order.
 */
export function rankBy<T extends Ranked>(items: T[], by: AdOrder): T[] {
  return [...items].sort(
    (a, b) => b[by] - a[by] || b.conversions - a.conversions || b.clicks - a.clicks || a.cost - b.cost
  );
}

/**
 * The Ads tab's headline answers. Each title is only given when it means
 * something: no "best ad" without a conversion, no "most clicks" without one.
 */
export function adHighlights(ads: AdLine[]) {
  const top = (by: AdOrder) => {
    const first = rankBy(ads, by)[0];
    return first && first[by] > 0 ? first : null;
  };

  return {
    total: ads.length,
    campaigns: new Set(ads.map((ad) => ad.campaignId)).size,
    best: top("conversions"),
    reach: top("impressions"),
    clicks: top("clicks"),
  };
}

/** The Ads tab: every ad shown in the period, and the best keywords. */
export function buildAdsReport({
  range,
  adRows,
  keywordRows,
  isSample,
  currency,
}: {
  range: ResolvedRange;
  adRows: AdRow[];
  keywordRows: KeywordRow[];
  isSample: boolean;
  /** The account's currency code; every money figure here is in it. */
  currency: string;
}) {
  return {
    status: "connected" as const,
    period: periodOf(range),
    ads: rankBy(adLines(adRows), "conversions"),
    keywords: rankBy(keywordLines(keywordRows), "conversions"),
    isSample,
    currency,
  };
}

export type AdsReport = ReturnType<typeof buildAdsReport>;
