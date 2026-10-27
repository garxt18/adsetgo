import type { AdRow, CallActionRow, CallRow, ConversionRow, GoogleAdsRow, KeywordRow } from "./auth.ts";
import { eachDay } from "./date-range.ts";

/**
 * Generated report rows, for building and demonstrating the product before a
 * Google Ads account with real traffic exists.
 *
 * Two rules make this safe, and both are enforced rather than remembered:
 *
 * 1. It is refused outside development (`isSampleDataEnabled`), and the
 *    variables that switch it on also fail a deployment build, the same way
 *    the local login shortcut does.
 * 2. Every response it feeds is flagged `isSample`, and the dashboards print a
 *    banner saying the figures are not from Google Ads. A number that cannot
 *    announce itself as invented has no business on a client's screen.
 *
 * Rows come back in the shape Google returns, so summarising, trends, campaign
 * grouping and period comparison all run the same code they run in production.
 */

// New campaigns go at the end: each day's generator is drawn from in this
// order, so appending leaves every earlier campaign's figures as they were.
const CAMPAIGNS = [
  { id: "1001", name: "Search — Brand", weight: 0.34, status: "ENABLED", channel: "SEARCH" },
  { id: "1002", name: "Search — Competitors", weight: 0.24, status: "ENABLED", channel: "SEARCH" },
  { id: "1003", name: "Performance Max — Retail", weight: 0.22, status: "ENABLED", channel: "PERFORMANCE_MAX" },
  { id: "1004", name: "Display — Remarketing", weight: 0.14, status: "ENABLED", channel: "DISPLAY" },
  { id: "1005", name: "Video — Awareness", weight: 0.06, status: "PAUSED", channel: "VIDEO" },
  { id: "1006", name: "Shopping — All Products", weight: 0.16, status: "ENABLED", channel: "SHOPPING" },
  { id: "1007", name: "App — Installs", weight: 0.08, status: "ENABLED", channel: "MULTI_CHANNEL" },
];

/** Small deterministic generator: the same account and day always agree. */
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}


/** Only ever true outside production, and only when explicitly switched on. */
export function isSampleDataEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.SAMPLE_DATA?.trim() === "1";
}

export function buildSampleRows({
  customerId,
  startDate,
  endDate,
}: {
  customerId: string;
  startDate: string;
  endDate: string;
}): GoogleAdsRow[] {
  const days = eachDay(startDate, endDate);
  const rows: GoogleAdsRow[] = [];

  for (const day of days) {
    // Seeded per account and day, so a date range and the period before it
    // share the days they overlap and comparisons stay stable across reloads.
    const random = mulberry32(seedFrom(`${customerId}:${day}`));

    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const dayFactor = (weekend ? 0.62 : 1) * (0.85 + random() * 0.3);

    for (const campaign of CAMPAIGNS) {
      if (campaign.status === "PAUSED" && random() > 0.35) continue;

      const impressions = Math.round(4200 * campaign.weight * dayFactor * (0.9 + random() * 0.2));
      const ctr = 0.031 + random() * 0.022;
      const clicks = Math.max(1, Math.round(impressions * ctr));
      const cpc = 0.9 + random() * 1.4;
      const cost = clicks * cpc;
      const conversionRate = 0.045 + random() * 0.05;
      const conversions = Math.round(clicks * conversionRate);

      rows.push({
        campaign: {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          advertisingChannelType: campaign.channel,
        },
        segments: { date: day },
        // Shaped exactly as Google's reply (camelCase, numbers as strings),
        // so sample mode exercises the same reading code live data does.
        metrics: {
          impressions: String(impressions),
          clicks: String(clicks),
          costMicros: String(Math.round(cost * 1_000_000)),
          conversions,
          conversionsValue: conversions * (48 + random() * 90),
        },
      });
    }
  }

  return rows;
}

/**
 * Generated calls in call_view's shape. Seeded on their own ("calls:"), so
 * adding them left the generated spend and clicks exactly as they were.
 */
export function buildSampleCalls({
  customerId,
  startDate,
  endDate,
}: {
  customerId: string;
  startDate: string;
  endDate: string;
}): CallRow[] {
  const rows: CallRow[] = [];
  // Search, Performance Max and Display ads carry call assets; video,
  // shopping and app campaigns rarely do.
  const calling = CAMPAIGNS.filter((campaign) => ["SEARCH", "PERFORMANCE_MAX", "DISPLAY"].includes(campaign.channel));
  const totalWeight = calling.reduce((sum, campaign) => sum + campaign.weight, 0);

  for (const day of eachDay(startDate, endDate)) {
    const random = mulberry32(seedFrom(`${customerId}:calls:${day}`));
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const count = Math.round((weekday === 0 || weekday === 6 ? 3 : 9) * (0.6 + random() * 0.8));

    for (let i = 0; i < count; i += 1) {
      let pick = random() * totalWeight;
      const campaign = calling.find((c) => (pick -= c.weight) <= 0) ?? calling[0];
      const missed = random() < 0.24;
      const hour = String(9 + Math.floor(random() * 10)).padStart(2, "0");
      const minute = String(Math.floor(random() * 60)).padStart(2, "0");

      rows.push({
        campaign: { id: campaign.id, name: campaign.name },
        callView: {
          startCallDateTime: `${day} ${hour}:${minute}:00`,
          callStatus: missed ? "MISSED" : "RECEIVED",
          callDurationSeconds: String(missed ? 0 : 35 + Math.round(random() * 420)),
          callTrackingDisplayLocation: random() < 0.72 ? "AD" : "LANDING_PAGE",
        },
      });
    }
  }

  return rows;
}

type SampleAction = { id: number; name: string; category: string; share: number; valued?: boolean };

const PURCHASE: Omit<SampleAction, "share"> = { id: 1, name: "Purchase", category: "PURCHASE", valued: true };
const ADD_TO_CART: Omit<SampleAction, "share"> = { id: 2, name: "Add to cart", category: "ADD_TO_CART", valued: true };
const LEAD_FORM: Omit<SampleAction, "share"> = { id: 3, name: "Lead form submitted", category: "SUBMIT_LEAD_FORM" };
const CALLS: Omit<SampleAction, "share"> = { id: 4, name: "Calls from ads", category: "PHONE_CALL_LEAD" };
const APPOINTMENT: Omit<SampleAction, "share"> = { id: 5, name: "Appointment booked", category: "BOOK_APPOINTMENT" };
const STORE_VISITS: Omit<SampleAction, "share"> = { id: 6, name: "Store visits", category: "STORE_VISIT" };
const SIGN_UP: Omit<SampleAction, "share"> = { id: 7, name: "Newsletter sign-up", category: "SIGNUP" };
const KEY_PAGES: Omit<SampleAction, "share"> = { id: 8, name: "Website visit — key pages", category: "PAGE_VIEW" };
const APP_INSTALL: Omit<SampleAction, "share"> = { id: 9, name: "App install (Android)", category: "DOWNLOAD" };
const IN_APP: Omit<SampleAction, "share"> = { id: 10, name: "In-app purchase", category: "PURCHASE", valued: true };
/** Secondary: recorded under All conversions only, as many accounts set up engaged visits. */
const ENGAGED = { id: 11, name: "Engaged visit (2+ pages)", category: "ENGAGEMENT" };

/** Which conversion actions each campaign type brings, and in what shares. */
const ACTION_MIX: Record<string, SampleAction[]> = {
  SEARCH: [
    { ...PURCHASE, share: 0.35 },
    { ...LEAD_FORM, share: 0.3 },
    { ...CALLS, share: 0.25 },
    { ...APPOINTMENT, share: 0.1 },
  ],
  PERFORMANCE_MAX: [
    { ...PURCHASE, share: 0.5 },
    { ...ADD_TO_CART, share: 0.2 },
    { ...LEAD_FORM, share: 0.15 },
    { ...STORE_VISITS, share: 0.15 },
  ],
  DISPLAY: [
    { ...LEAD_FORM, share: 0.4 },
    { ...SIGN_UP, share: 0.35 },
    { ...PURCHASE, share: 0.25 },
  ],
  VIDEO: [
    { ...SIGN_UP, share: 0.5 },
    { ...KEY_PAGES, share: 0.5 },
  ],
  SHOPPING: [
    { ...PURCHASE, share: 0.75 },
    { ...ADD_TO_CART, share: 0.25 },
  ],
  MULTI_CHANNEL: [
    { ...APP_INSTALL, share: 0.8 },
    { ...IN_APP, share: 0.2 },
  ],
};

/** A whole number split by shares, largest remainders first, so the parts add up exactly. */
function splitByShares(total: number, shares: number[]): number[] {
  const exact = shares.map((share) => total * share);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((sum, part) => sum + part, 0);

  const byRemainder = exact.map((value, index) => index).sort((a, b) => exact[b] - parts[b] - (exact[a] - parts[a]));
  for (const index of byRemainder) {
    if (left <= 0) break;
    parts[index] += 1;
    left -= 1;
  }

  return parts;
}

/**
 * Generated conversions in the shape of the campaign report segmented by
 * conversion action. Each campaign's conversions and value are its generated
 * campaign figures split across its type's actions, so the Conversions tab
 * adds up to exactly what the Overview shows.
 */
export function buildSampleConversions({
  customerId,
  startDate,
  endDate,
}: {
  customerId: string;
  startDate: string;
  endDate: string;
}): ConversionRow[] {
  const totals = new Map<string, { conversions: number; value: number; clicks: number }>();
  for (const row of buildSampleRows({ customerId, startDate, endDate })) {
    const id = String(row.campaign?.id);
    const total = totals.get(id) ?? { conversions: 0, value: 0, clicks: 0 };
    total.conversions += Number(row.metrics?.conversions ?? 0);
    total.value += Number(row.metrics?.conversionsValue ?? 0);
    total.clicks += Number(row.metrics?.clicks ?? 0);
    totals.set(id, total);
  }

  const action = (id: number) => `customers/${customerId}/conversionActions/${id}`;
  const rows: ConversionRow[] = [];

  for (const campaign of CAMPAIGNS) {
    const total = totals.get(campaign.id);
    if (!total) continue;

    const mix = ACTION_MIX[campaign.channel] ?? [];
    const counts = splitByShares(total.conversions, mix.map((a) => a.share));
    // Value goes to the actions that carry one (purchases); if none came in,
    // to every action, so the tab's value still matches the Overview's.
    const valuedCount = mix.reduce((sum, a, i) => sum + (a.valued ? counts[i] : 0), 0);
    const weightOf = (i: number) => (valuedCount > 0 ? (mix[i].valued ? counts[i] : 0) : counts[i]);
    const totalWeight = counts.reduce((sum, _, i) => sum + weightOf(i), 0);
    const base = {
      campaign: { id: campaign.id, name: campaign.name, advertisingChannelType: campaign.channel },
    };

    mix.forEach((a, i) => {
      if (counts[i] === 0) return;
      const value = totalWeight > 0 ? (total.value * weightOf(i)) / totalWeight : 0;
      rows.push({
        ...base,
        segments: { conversionAction: action(a.id), conversionActionName: a.name, conversionActionCategory: a.category },
        metrics: { conversions: counts[i], conversionsValue: value, allConversions: counts[i], allConversionsValue: value },
      });
    });

    const engaged = ["SEARCH", "DISPLAY", "PERFORMANCE_MAX"].includes(campaign.channel)
      ? Math.round(total.clicks * 0.12)
      : 0;
    if (engaged > 0) {
      rows.push({
        ...base,
        segments: {
          conversionAction: action(ENGAGED.id),
          conversionActionName: ENGAGED.name,
          conversionActionCategory: ENGAGED.category,
        },
        metrics: { conversions: 0, conversionsValue: 0, allConversions: engaged, allConversionsValue: 0 },
      });
    }
  }

  return rows;
}

/**
 * The sample account's call conversion settings, in conversion_action's shape:
 * the "Calls from ads" action above, on Google's defaults (60 seconds, once per
 * ad click), and a website call action that recorded nothing, as many accounts
 * have.
 */
export function buildSampleCallActions(customerId: string): CallActionRow[] {
  const action = (id: number) => `customers/${customerId}/conversionActions/${id}`;

  return [
    {
      conversionAction: {
        resourceName: action(CALLS.id),
        name: CALLS.name,
        type: "AD_CALL",
        status: "ENABLED",
        countingType: "ONE_PER_CLICK",
        phoneCallDurationSeconds: "60",
        primaryForGoal: true,
      },
    },
    {
      conversionAction: {
        resourceName: action(12),
        name: "Calls from website",
        type: "WEBSITE_CALL",
        status: "ENABLED",
        countingType: "MANY_PER_CLICK",
        phoneCallDurationSeconds: "90",
        primaryForGoal: true,
      },
    },
  ];
}

const SAMPLE_ADS: Record<string, Array<{ group: string; headlines: string[] }>> = {
  "1001": [
    { group: "Brand — Exact", headlines: ["Official Site", "Free Delivery on Big Orders", "Shop the New Range"] },
    { group: "Brand — Exact", headlines: ["Rated 4.8 by Customers", "Order Before 2pm", "Next-Day Delivery"] },
  ],
  "1002": [
    { group: "Competitor Terms", headlines: ["A Better Alternative", "Compare Prices Today", "Switch in Minutes"] },
    { group: "Competitor Terms", headlines: ["Why Customers Switch", "Price Match Promise", "Try It Free"] },
  ],
  "1004": [{ group: "Past Visitors", headlines: ["Still Thinking It Over?", "Your Basket Is Waiting"] }],
  "1005": [{ group: "Awareness", headlines: [] }],
};

/** Totals for a whole period, scaled by its length; seeded per item and period. */
function periodFigures(seed: string, days: number, weight: number) {
  const random = mulberry32(seedFrom(seed));
  const impressions = Math.round(days * 1400 * weight * (0.5 + random()));
  const clicks = Math.max(1, Math.round(impressions * (0.02 + random() * 0.05)));
  const conversions = Math.round(clicks * (0.02 + random() * 0.09));
  const cost = clicks * (0.9 + random() * 1.6);
  return {
    impressions: String(impressions),
    clicks: String(clicks),
    costMicros: String(Math.round(cost * 1_000_000)),
    conversions,
  };
}

/** Generated ads in ad_group_ad's shape. Performance Max has none, as in Google. */
export function buildSampleAds({
  customerId,
  startDate,
  endDate,
}: {
  customerId: string;
  startDate: string;
  endDate: string;
}): AdRow[] {
  const days = eachDay(startDate, endDate).length;

  return CAMPAIGNS.flatMap((campaign) =>
    (SAMPLE_ADS[campaign.id] ?? []).map((ad, index) => {
      const id = `${campaign.id}${index + 1}`;
      const video = ad.headlines.length === 0;
      return {
        campaign: { id: campaign.id, name: campaign.name },
        adGroup: { id: `${campaign.id}0`, name: ad.group },
        adGroupAd: {
          status: campaign.status,
          ad: {
            id,
            name: video ? "Spring launch — 15s" : undefined,
            type: video ? "VIDEO_RESPONSIVE_AD" : "RESPONSIVE_SEARCH_AD",
            responsiveSearchAd: video ? undefined : { headlines: ad.headlines.map((text) => ({ text })) },
          },
        },
        metrics: periodFigures(`${customerId}:ad:${id}:${startDate}:${endDate}`, days, campaign.weight / 2),
      };
    })
  );
}

const SAMPLE_KEYWORDS = [
  { campaign: 0, text: "brand name", matchType: "EXACT" },
  { campaign: 0, text: "brand name shop", matchType: "PHRASE" },
  { campaign: 0, text: "brand name delivery", matchType: "PHRASE" },
  { campaign: 0, text: "brand discount code", matchType: "BROAD" },
  { campaign: 1, text: "best alternative to rival", matchType: "PHRASE" },
  { campaign: 1, text: "rival prices", matchType: "EXACT" },
  { campaign: 1, text: "cheaper than rival", matchType: "BROAD" },
  { campaign: 1, text: "rival vs brand", matchType: "PHRASE" },
];

/** Generated keywords in keyword_view's shape, for the two Search campaigns. */
export function buildSampleKeywords({
  customerId,
  startDate,
  endDate,
}: {
  customerId: string;
  startDate: string;
  endDate: string;
}): KeywordRow[] {
  const days = eachDay(startDate, endDate).length;

  return SAMPLE_KEYWORDS.map((keyword, index) => {
    const campaign = CAMPAIGNS[keyword.campaign];
    return {
      campaign: { id: campaign.id, name: campaign.name },
      adGroup: { id: `${campaign.id}0`, name: SAMPLE_ADS[campaign.id][0].group },
      adGroupCriterion: {
        criterionId: String(5000 + index),
        status: "ENABLED",
        keyword: { text: keyword.text, matchType: keyword.matchType },
      },
      metrics: periodFigures(`${customerId}:kw:${index}:${startDate}:${endDate}`, days, campaign.weight / 4),
    };
  });
}
