/**
 * Turns Google Ads conversion rows into what the Conversions tab shows:
 * results split by what the customer did (bought, sent a lead form, installed
 * the app, visited a key page, phoned) and by the kind of campaign that
 * brought them (Search, Shopping, Video, Display, Performance Max, ...).
 *
 * Pure, like report.ts and calls.ts: live and sample rows go through the same
 * arithmetic, and it is tested directly. The report carries the lines rather
 * than finished tables, so the tab can narrow them to one campaign type
 * without another request to Google.
 */

import type { ConversionRow, GoogleAdsRow } from "./auth.ts";
import { percentChange, periodOf, type ResolvedRange } from "./date-range.ts";
import { summarize } from "./report.ts";

const round2 = (value: number) => Number(value.toFixed(2));

/** What a customer did, grouped the way an agency talks about results. */
export const CONVERSION_GOALS = {
  sales: "Purchases & sales",
  leads: "Leads",
  calls: "Calls",
  website: "Website visits & engagement",
  app: "App installs",
  store: "Store visits & directions",
  other: "Other",
} as const;

export type ConversionGoal = keyof typeof CONVERSION_GOALS;

/**
 * Google's conversion action categories (ConversionActionCategoryEnum), named
 * as people say them. App installs are DOWNLOAD whatever tracks them
 * (Google Play, Firebase or a third-party SDK).
 */
const CATEGORIES: Record<string, { label: string; goal: ConversionGoal }> = {
  PURCHASE: { label: "Purchases", goal: "sales" },
  ADD_TO_CART: { label: "Add to cart", goal: "sales" },
  BEGIN_CHECKOUT: { label: "Begin checkout", goal: "sales" },
  SUBSCRIBE_PAID: { label: "Paid subscriptions", goal: "sales" },
  STORE_SALE: { label: "Store sales", goal: "sales" },
  SUBMIT_LEAD_FORM: { label: "Lead form submissions", goal: "leads" },
  CONTACT: { label: "Contacts", goal: "leads" },
  REQUEST_QUOTE: { label: "Quote requests", goal: "leads" },
  BOOK_APPOINTMENT: { label: "Appointments booked", goal: "leads" },
  SIGNUP: { label: "Sign-ups", goal: "leads" },
  LEAD: { label: "Leads", goal: "leads" },
  IMPORTED_LEAD: { label: "Imported leads", goal: "leads" },
  QUALIFIED_LEAD: { label: "Qualified leads", goal: "leads" },
  CONVERTED_LEAD: { label: "Converted leads", goal: "leads" },
  PHONE_CALL_LEAD: { label: "Phone calls", goal: "calls" },
  PAGE_VIEW: { label: "Website visits (page views)", goal: "website" },
  ENGAGEMENT: { label: "Engagements", goal: "website" },
  OUTBOUND_CLICK: { label: "Outbound clicks", goal: "website" },
  DOWNLOAD: { label: "App installs & downloads", goal: "app" },
  STORE_VISIT: { label: "Store visits", goal: "store" },
  GET_DIRECTIONS: { label: "Directions requests", goal: "store" },
  DEFAULT: { label: "Other actions", goal: "other" },
  UNKNOWN: { label: "Other actions", goal: "other" },
  UNSPECIFIED: { label: "Other actions", goal: "other" },
};

/** Google's campaign types (AdvertisingChannelTypeEnum), as the Google Ads UI names them. */
const CHANNELS: Record<string, string> = {
  SEARCH: "Search",
  SHOPPING: "Shopping",
  VIDEO: "Video",
  DISPLAY: "Display",
  PERFORMANCE_MAX: "Performance Max",
  DEMAND_GEN: "Demand Gen",
  MULTI_CHANNEL: "App",
  LOCAL: "Local",
  SMART: "Smart",
  HOTEL: "Hotel",
  TRAVEL: "Travel",
  LOCAL_SERVICES: "Local Services",
};

/** "SOME_NEW_THING" reads as "Some new thing". */
function readable(code: string): string {
  const words = code.toLowerCase().replace(/_/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "";
}

/**
 * A category's name and goal. One Google adds later still shows, under its own
 * name in Other, rather than vanishing from the totals.
 */
export function conversionCategory(code: string | undefined): { label: string; goal: ConversionGoal } {
  return CATEGORIES[code ?? ""] ?? { label: readable(code ?? "") || "Other actions", goal: "other" };
}

/** A campaign type's name; a type Google adds later reads as its own code. */
export function channelLabel(code: string | undefined): string {
  if (!code || code === "UNKNOWN" || code === "UNSPECIFIED") return "Other";
  return CHANNELS[code] ?? readable(code);
}

/** One conversion action in one campaign over a whole window. */
export function conversionLines(rows: ConversionRow[]) {
  return rows.map((row) => ({
    campaignId: String(row.campaign?.id ?? "unknown"),
    campaign: row.campaign?.name ?? "Campaign",
    channel: row.campaign?.advertisingChannelType ?? "",
    actionId: row.segments?.conversionAction ?? row.segments?.conversionActionName ?? "unknown",
    action: row.segments?.conversionActionName ?? "Conversion action",
    category: row.segments?.conversionActionCategory ?? "DEFAULT",
    // Kept fractional: data-driven attribution splits one conversion across
    // campaigns, and rounding each piece first would lose some of the total.
    conversions: Number(row.metrics?.conversions ?? 0),
    value: Number(row.metrics?.conversionsValue ?? 0),
    allConversions: Number(row.metrics?.allConversions ?? 0),
  }));
}

export type ConversionLine = ReturnType<typeof conversionLines>[number];

/** The filter value that keeps every campaign type. */
export const ALL_CHANNELS = "all";

export function inChannel(lines: ConversionLine[], channel: string): ConversionLine[] {
  return channel === ALL_CHANNELS ? lines : lines.filter((line) => line.channel === channel);
}

const sum = (lines: ConversionLine[], pick: (line: ConversionLine) => number) =>
  lines.reduce((total, line) => total + pick(line), 0);

/** Headline figures for one set of lines, against the same set the period before. */
export function conversionTotals(lines: ConversionLine[], previousLines: ConversionLine[]) {
  const conversions = sum(lines, (line) => line.conversions);
  const previousConversions = sum(previousLines, (line) => line.conversions);
  const value = sum(lines, (line) => line.value);

  return {
    conversions: round2(conversions),
    value: round2(value),
    allConversions: round2(sum(lines, (line) => line.allConversions)),
    previousConversions: round2(previousConversions),
    change: percentChange(conversions, previousConversions),
    valueChange: percentChange(value, sum(previousLines, (line) => line.value)),
  };
}

type Tally = { conversions: number; value: number; allConversions: number; previousConversions: number };

/**
 * Lines added up under a key, each entry described by the first line seen for
 * it. Entries from the period before alone are kept, so a result that stopped
 * altogether shows as a fall to zero rather than disappearing. Most
 * conversions first.
 */
function breakdown<D extends object>(
  lines: ConversionLine[],
  previousLines: ConversionLine[],
  keyOf: (line: ConversionLine) => string,
  describe: (line: ConversionLine) => D
) {
  const entries = new Map<string, D & Tally>();
  const at = (line: ConversionLine) => {
    const key = keyOf(line);
    let entry = entries.get(key);
    if (!entry) {
      entry = { ...describe(line), conversions: 0, value: 0, allConversions: 0, previousConversions: 0 };
      entries.set(key, entry);
    }
    return entry;
  };

  for (const line of lines) {
    const entry = at(line);
    entry.conversions += line.conversions;
    entry.value += line.value;
    entry.allConversions += line.allConversions;
  }
  for (const line of previousLines) at(line).previousConversions += line.conversions;

  return Array.from(entries, ([key, entry]) => ({
    ...entry,
    key,
    conversions: round2(entry.conversions),
    value: round2(entry.value),
    allConversions: round2(entry.allConversions),
    previousConversions: round2(entry.previousConversions),
    change: percentChange(entry.conversions, entry.previousConversions),
  }))
    .filter((entry) => entry.allConversions > 0 || entry.previousConversions > 0)
    .sort(
      (a, b) =>
        b.conversions - a.conversions ||
        b.allConversions - a.allConversions ||
        b.previousConversions - a.previousConversions
    );
}

/** Results by what the customer did: purchases, lead forms, page views, ... */
export function byCategory(lines: ConversionLine[], previousLines: ConversionLine[]) {
  return breakdown(lines, previousLines, (line) => line.category, (line) => ({
    category: line.category,
    ...conversionCategory(line.category),
  }));
}

/** Results by goal, the categories gathered: sales, leads, calls, website, app, store. */
export function byGoal(lines: ConversionLine[], previousLines: ConversionLine[]) {
  const goalOf = (line: ConversionLine) => conversionCategory(line.category).goal;
  return breakdown(lines, previousLines, goalOf, (line) => ({
    goal: goalOf(line),
    label: CONVERSION_GOALS[goalOf(line)],
  }));
}

/**
 * Results by conversion action, as the account names them. An action with
 * nothing in Conversions but something in All conversions is a secondary
 * action: recorded, but not counted as a conversion or used for bidding.
 */
export function byAction(lines: ConversionLine[], previousLines: ConversionLine[]) {
  return breakdown(lines, previousLines, (line) => line.actionId, (line) => ({
    action: line.action,
    category: line.category,
    label: conversionCategory(line.category).label,
  })).map((entry) => ({
    ...entry,
    secondary: entry.conversions === 0 && entry.allConversions > 0,
    channels: [
      ...new Set(
        lines.filter((line) => line.actionId === entry.key && line.allConversions > 0).map((line) => channelLabel(line.channel))
      ),
    ],
  }));
}

/** Results by campaign, each with the kinds of result it brought, most first. */
export function byCampaign(lines: ConversionLine[], previousLines: ConversionLine[]) {
  return breakdown(lines, previousLines, (line) => line.campaignId, (line) => ({
    campaign: line.campaign,
    channel: line.channel,
  })).map((entry) => ({
    ...entry,
    categories: byCategory(
      lines.filter((line) => line.campaignId === entry.key),
      []
    )
      .filter((category) => category.conversions > 0)
      .map(({ label, conversions }) => ({ label, conversions })),
  }));
}

/** Shown at least once or cost something in the period. */
const ran = (row: GoogleAdsRow) => Number(row.metrics?.impressions ?? 0) > 0 || Number(row.metrics?.costMicros ?? 0) > 0;

/**
 * Spend and results by campaign type, from the campaign report. Cost cannot be
 * split by conversion action -- Google refuses cost alongside conversion
 * segments -- so cost per conversion is worked out per campaign type instead.
 */
export function channelLines(rows: GoogleAdsRow[], previousRows: GoogleAdsRow[]) {
  const channelOf = (row: GoogleAdsRow) => row.campaign?.advertisingChannelType ?? "";
  const grouped = (source: GoogleAdsRow[]) => {
    const groups = new Map<string, GoogleAdsRow[]>();
    for (const row of source) groups.set(channelOf(row), [...(groups.get(channelOf(row)) ?? []), row]);
    return groups;
  };

  const before = grouped(previousRows);

  return Array.from(grouped(rows), ([channel, channelRows]) => {
    const s = summarize(channelRows);
    const previous = summarize(before.get(channel) ?? []);
    return {
      channel,
      label: channelLabel(channel),
      campaigns: new Set(channelRows.filter(ran).map((row) => String(row.campaign?.id ?? ""))).size,
      cost: s.cost,
      clicks: s.clicks,
      conversions: s.conversions,
      costPerConversion: s.costPerConversion,
      conversionRate: s.conversionRate,
      conversionValue: s.conversionValue,
      roas: s.roas,
      previousConversions: previous.conversions,
      change: percentChange(s.conversions, previous.conversions),
    };
  })
    .filter((line) => line.campaigns > 0 || line.conversions > 0)
    .sort((a, b) => b.cost - a.cost || b.conversions - a.conversions);
}

export type ChannelLine = ReturnType<typeof channelLines>[number];

/** The Conversions tab: both windows' lines, and spend by campaign type. */
export function buildConversionReport({
  range,
  rows,
  previousRows,
  campaignRows,
  previousCampaignRows,
  isSample,
  currency,
}: {
  range: ResolvedRange;
  rows: ConversionRow[];
  previousRows: ConversionRow[];
  /** The main report's campaign rows, for spend by campaign type. */
  campaignRows: GoogleAdsRow[];
  previousCampaignRows: GoogleAdsRow[];
  isSample: boolean;
  /** The account's currency code; every money figure here is in it. */
  currency: string;
}) {
  return {
    status: "connected" as const,
    period: periodOf(range),
    lines: conversionLines(rows),
    previousLines: conversionLines(previousRows),
    channels: channelLines(campaignRows, previousCampaignRows),
    isSample,
    currency,
  };
}

export type ConversionReport = ReturnType<typeof buildConversionReport>;
