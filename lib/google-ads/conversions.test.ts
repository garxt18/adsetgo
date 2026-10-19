import test from "node:test";
import assert from "node:assert/strict";

import type { ConversionRow, GoogleAdsRow } from "./auth.ts";
import {
  ALL_CHANNELS,
  buildConversionReport,
  byAction,
  byCampaign,
  byCategory,
  byGoal,
  channelLabel,
  channelLines,
  conversionCategory,
  conversionLines,
  conversionTotals,
  inChannel,
} from "./conversions.ts";
import { resolveRange } from "./date-range.ts";
import { summarize } from "./report.ts";
import { buildSampleConversions, buildSampleRows } from "./sample-data.ts";

function conv(
  campaign: string,
  channel: string,
  action: string,
  category: string,
  conversions: number,
  extra: { value?: number; all?: number } = {}
): ConversionRow {
  return {
    campaign: { id: campaign, name: `Campaign ${campaign}`, advertisingChannelType: channel },
    segments: {
      conversionAction: `customers/1/conversionActions/${action}`,
      conversionActionName: action,
      conversionActionCategory: category,
    },
    metrics: { conversions, conversionsValue: extra.value ?? 0, allConversions: extra.all ?? conversions },
  };
}

const ROWS = [
  conv("s", "SEARCH", "Purchase", "PURCHASE", 4, { value: 400 }),
  conv("s", "SEARCH", "Lead form", "SUBMIT_LEAD_FORM", 6),
  conv("s", "SEARCH", "Calls", "PHONE_CALL_LEAD", 3),
  conv("sh", "SHOPPING", "Purchase", "PURCHASE", 10, { value: 900 }),
  conv("v", "VIDEO", "Key pages", "PAGE_VIEW", 2.5),
  conv("a", "MULTI_CHANNEL", "Install", "DOWNLOAD", 7),
  // Secondary: recorded under All conversions only.
  conv("s", "SEARCH", "Engaged visit", "ENGAGEMENT", 0, { all: 20 }),
];

const PREVIOUS = [
  conv("s", "SEARCH", "Purchase", "PURCHASE", 2, { value: 150 }),
  conv("s", "SEARCH", "Quote", "REQUEST_QUOTE", 5),
  conv("sh", "SHOPPING", "Purchase", "PURCHASE", 10, { value: 800 }),
];

const lines = conversionLines(ROWS);
const previous = conversionLines(PREVIOUS);

test("categories are named as people say them, new ones by their own name", () => {
  assert.deepEqual(conversionCategory("SUBMIT_LEAD_FORM"), { label: "Lead form submissions", goal: "leads" });
  assert.deepEqual(conversionCategory("DOWNLOAD"), { label: "App installs & downloads", goal: "app" });
  assert.deepEqual(conversionCategory("PAGE_VIEW").goal, "website");
  assert.deepEqual(conversionCategory("SOME_NEW_THING"), { label: "Some new thing", goal: "other" });
  assert.equal(conversionCategory(undefined).goal, "other");
});

test("campaign types read as the Google Ads UI names them", () => {
  assert.equal(channelLabel("PERFORMANCE_MAX"), "Performance Max");
  assert.equal(channelLabel("MULTI_CHANNEL"), "App");
  assert.equal(channelLabel("DEMAND_GEN"), "Demand Gen");
  assert.equal(channelLabel("UNKNOWN"), "Other");
  assert.equal(channelLabel(""), "Other");
  assert.equal(channelLabel("BRAND_NEW_TYPE"), "Brand new type");
});

test("totals count primary conversions, and all conversions separately", () => {
  const t = conversionTotals(lines, previous);

  assert.equal(t.conversions, 32.5);
  assert.equal(t.allConversions, 52.5);
  assert.equal(t.value, 1300);
  assert.equal(t.previousConversions, 17);
  assert.equal(Math.round(t.change ?? 0), 91);
});

test("categories are ranked by results, with a vanished one kept as a fall", () => {
  const categories = byCategory(lines, previous);

  assert.deepEqual(
    categories.map((c) => [c.category, c.conversions]),
    [
      ["PURCHASE", 14],
      ["DOWNLOAD", 7],
      ["SUBMIT_LEAD_FORM", 6],
      ["PHONE_CALL_LEAD", 3],
      ["PAGE_VIEW", 2.5],
      ["ENGAGEMENT", 0],
      ["REQUEST_QUOTE", 0],
    ]
  );
  const quote = categories.find((c) => c.category === "REQUEST_QUOTE");
  assert.equal(quote?.previousConversions, 5);
  assert.equal(quote?.change, -100);
  // 12 before, 14 now.
  assert.equal(Math.round(categories[0].change ?? 0), 17);
});

test("goals gather categories: sales, leads, calls, website, app", () => {
  const goals = Object.fromEntries(byGoal(lines, previous).map((g) => [g.goal, g.conversions]));

  assert.deepEqual(goals, { sales: 14, app: 7, leads: 6, calls: 3, website: 2.5 });
});

test("an action with nothing in Conversions but some in All conversions is secondary", () => {
  const actions = byAction(lines, previous);
  const engaged = actions.find((a) => a.action === "Engaged visit");
  const purchase = actions.find((a) => a.action === "Purchase");

  assert.equal(engaged?.secondary, true);
  assert.equal(engaged?.allConversions, 20);
  assert.equal(purchase?.secondary, false);
  // One action used by two campaign types lists both.
  assert.deepEqual(purchase?.channels, ["Search", "Shopping"]);
});

test("campaigns list the kinds of result they brought, most first", () => {
  const search = byCampaign(lines, previous).find((c) => c.key === "s");

  assert.equal(search?.conversions, 13);
  assert.deepEqual(search?.categories.map((c) => c.label), ["Lead form submissions", "Purchases", "Phone calls"]);
});

test("narrowing to one campaign type keeps only its lines", () => {
  assert.equal(inChannel(lines, ALL_CHANNELS).length, lines.length);
  const shopping = inChannel(lines, "SHOPPING");
  assert.equal(conversionTotals(shopping, inChannel(previous, "SHOPPING")).change, 0);
  assert.deepEqual(byGoal(shopping, []).map((g) => g.goal), ["sales"]);
});

function campaignRow(id: string, channel: string, m: { cost: number; clicks: number; conversions: number; value?: number }): GoogleAdsRow {
  return {
    campaign: { id, name: `Campaign ${id}`, advertisingChannelType: channel },
    segments: { date: "2026-03-01" },
    metrics: {
      impressions: m.clicks * 20,
      clicks: m.clicks,
      costMicros: m.cost * 1_000_000,
      conversions: m.conversions,
      conversionsValue: m.value ?? 0,
    },
  };
}

test("campaign types carry spend, cost per conversion and return on spend", () => {
  const channels = channelLines(
    [
      campaignRow("s1", "SEARCH", { cost: 200, clicks: 100, conversions: 10, value: 500 }),
      campaignRow("s2", "SEARCH", { cost: 100, clicks: 50, conversions: 5 }),
      campaignRow("v", "VIDEO", { cost: 50, clicks: 10, conversions: 0 }),
    ],
    [campaignRow("s1", "SEARCH", { cost: 100, clicks: 50, conversions: 10 })]
  );

  assert.deepEqual(channels.map((c) => c.channel), ["SEARCH", "VIDEO"]);
  const [search, video] = channels;
  assert.equal(search.campaigns, 2);
  assert.equal(search.costPerConversion, 20);
  assert.equal(search.conversionRate, 10);
  assert.equal(search.roas, 1.67);
  assert.equal(search.change, 50);
  assert.equal(video.costPerConversion, 0);
  assert.equal(video.change, null);
});

test("sample conversions add up to exactly what the overview shows", () => {
  const range = resolveRange("last_30_days", new Date("2026-03-20T09:00:00Z"));
  const args = { customerId: "1234567890", startDate: range.start, endDate: range.end };
  const previousArgs = { customerId: "1234567890", startDate: range.previousStart, endDate: range.previousEnd };
  const campaignRows = buildSampleRows(args);

  const report = buildConversionReport({
    range,
    rows: buildSampleConversions(args),
    previousRows: buildSampleConversions(previousArgs),
    campaignRows,
    previousCampaignRows: buildSampleRows(previousArgs),
    isSample: true,
    currency: "INR",
  });

  const overview = summarize(campaignRows);
  const totals = conversionTotals(report.lines, report.previousLines);
  assert.equal(totals.conversions, overview.conversions);
  assert.equal(Math.round(totals.value), Math.round(overview.conversionValue));
  assert.ok(totals.allConversions > totals.conversions, "secondary actions are generated too");

  // Every campaign type in the sample account shows, and so does every goal.
  assert.deepEqual(
    report.channels.map((c) => c.channel).sort(),
    ["DISPLAY", "MULTI_CHANNEL", "PERFORMANCE_MAX", "SEARCH", "SHOPPING", "VIDEO"]
  );
  assert.deepEqual(
    byGoal(report.lines, []).map((g) => g.goal).sort(),
    ["app", "calls", "leads", "sales", "store", "website"]
  );
});
