import test from "node:test";
import assert from "node:assert/strict";

import type { GoogleAdsRow } from "./auth.ts";
import { resolveRange } from "./date-range.ts";
import {
  buildReport,
  campaignHighlights,
  groupByCampaign,
  groupByDay,
  orderCampaigns,
  summarize,
  totalsByCurrency,
  type CampaignLine,
} from "./report.ts";
import { buildSampleRows } from "./sample-data.ts";

// Google sends numbers as strings and money in micros; rows are built the same way here.
function row(date: string, campaign: string, m: { impressions: number; clicks: number; spend: number; conversions: number }): GoogleAdsRow {
  return {
    segments: { date },
    campaign: { id: campaign, name: `Campaign ${campaign}`, status: "ENABLED" },
    metrics: {
      impressions: String(m.impressions),
      clicks: String(m.clicks),
      costMicros: String(m.spend * 1_000_000),
      conversions: m.conversions,
    },
  };
}

const ROWS = [
  row("2026-03-02", "a", { impressions: 1000, clicks: 50, spend: 100, conversions: 5 }),
  row("2026-03-01", "a", { impressions: 500, clicks: 25, spend: 50, conversions: 0 }),
  row("2026-03-01", "b", { impressions: 500, clicks: 25, spend: 50, conversions: 5 }),
];

test("a summary adds up the rows and works out rates from the totals", () => {
  const s = summarize(ROWS);

  assert.equal(s.impressions, 2000);
  assert.equal(s.clicks, 100);
  assert.equal(s.cost, 200);
  assert.equal(s.conversions, 10);
  assert.equal(s.ctr, 5);
  assert.equal(s.averageCpc, 2);
  assert.equal(s.costPerConversion, 20);
  assert.equal(s.conversionRate, 10);
});

test("a rate with nothing to divide by is 0, never NaN or Infinity", () => {
  // A dashboard tile would otherwise read "NaN%" or "₹Infinity".
  const quiet = summarize([row("2026-03-01", "a", { impressions: 0, clicks: 0, spend: 0, conversions: 0 })]);

  for (const key of ["ctr", "averageCpc", "costPerConversion", "conversionRate", "roas"] as const) {
    assert.equal(quiet[key], 0, key);
  }

  assert.equal(summarize([]).cost, 0);
});

test("days come out in date order with their own rates", () => {
  const days = groupByDay(ROWS);

  assert.deepEqual(days.map((d) => d.date), ["2026-03-01", "2026-03-02"]);
  assert.equal(days[0].cost, 100);
  assert.equal(days[0].conversions, 5);
  assert.equal(days[0].costPerConversion, 20);
  assert.equal(days[1].ctr, 5);
});

test("a campaign's rows across days are combined into one line", () => {
  const campaigns = groupByCampaign(ROWS);

  assert.equal(campaigns.length, 2);
  const a = campaigns.find((c) => c.id === "a");
  assert.equal(a?.cost, 150);
  assert.equal(a?.clicks, 75);
  assert.equal(a?.name, "Campaign a");
});

test("a report compares with the period before, and says so when it cannot", () => {
  const range = resolveRange("last_7_days", new Date("2026-03-09T09:00:00Z"));
  const previous = [row("2026-02-24", "a", { impressions: 1000, clicks: 50, spend: 400, conversions: 0 })];

  const report = buildReport({ range, rows: ROWS, previousRows: previous, isSample: false, currency: "INR" });

  assert.equal(report.changes.cost, -50);
  // Conversions went from 0 to 10: there is no percentage for that, not "Infinity%".
  assert.equal(report.changes.conversions, null);
  assert.equal("key" in report.period, false);
  assert.equal(report.period.start, range.start);
});

test("sample rows go through the same arithmetic, one trend point per day", () => {
  const range = resolveRange("last_14_days", new Date("2026-03-20T09:00:00Z"));
  const rows = buildSampleRows({ customerId: "1234567890", startDate: range.start, endDate: range.end });

  const report = buildReport({ range, rows, previousRows: [], isSample: true, currency: "INR" });

  assert.equal(report.trend.length, 14);
  assert.equal(report.isSample, true);
  // Each day is rounded to the paisa on its own, so their sum may differ from
  // the rounded total by a paisa per day at most -- never by more.
  const daySum = report.trend.reduce((sum, d) => sum + d.cost, 0);
  assert.ok(Math.abs(report.metrics.cost - daySum) <= 0.01 * report.trend.length);
});

test("spend is read the way Google's REST API spells it", () => {
  // The query says metrics.cost_micros; the JSON reply says costMicros. Reading
  // the query's spelling found nothing, and every live report showed ₹0 spend.
  const reply = JSON.parse(
    '{"segments":{"date":"2026-03-01"},"campaign":{"id":"1"},"metrics":{"clicks":"4","costMicros":"2500000","conversionsValue":12.5}}'
  ) as GoogleAdsRow;

  const s = summarize([reply]);
  assert.equal(s.cost, 2.5);
  assert.equal(s.conversionValue, 12.5);
  assert.equal(s.roas, 5);
});

test("an agency's spend is totalled per currency, never across them", () => {
  const totals = totalsByCurrency([
    { currency: "INR", cost: 1814, conversions: 76 },
    { currency: "GBP", cost: 1278.76, conversions: 26 },
    { currency: "INR", cost: 1729, conversions: 72 },
  ]);

  assert.deepEqual(totals, [
    { currency: "INR", cost: 3543, conversions: 148, costPerConversion: 23.94 },
    { currency: "GBP", cost: 1278.76, conversions: 26, costPerConversion: 49.18 },
  ]);
});

test("a currency with no conversions has no cost per conversion", () => {
  assert.deepEqual(totalsByCurrency([{ currency: "GBP", cost: 50, conversions: 0 }]), [
    { currency: "GBP", cost: 50, conversions: 0, costPerConversion: 0 },
  ]);
});

test("quiet days are drawn as zero, so the chart covers the whole period", () => {
  // Activity on the 1st and 2nd only, in a period running to the 4th.
  const days = groupByDay(ROWS, "2026-03-01", "2026-03-04");

  assert.deepEqual(days.map((d) => [d.date, d.clicks]), [
    ["2026-03-01", 50],
    ["2026-03-02", 50],
    ["2026-03-03", 0],
    ["2026-03-04", 0],
  ]);
  assert.equal(days[3].costPerConversion, 0);
});

function line(id: string, m: { cost: number; conversions: number; impressions?: number; status?: string }): CampaignLine {
  return {
    id,
    name: `Campaign ${id}`,
    status: m.status ?? "ENABLED",
    impressions: m.impressions ?? 100,
    clicks: 10,
    cost: m.cost,
    conversions: m.conversions,
    ctr: 10,
    averageCpc: m.cost / 10,
  };
}

const LINES = [
  line("brand", { cost: 685, conversions: 27 }), // most conversions
  line("eu", { cost: 872, conversions: 23 }), // most spend
  line("lv", { cost: 174, conversions: 0 }), // money for nothing
  line("uk", { cost: 115, conversions: 1, status: "PAUSED" }),
  line("off", { cost: 0, conversions: 0, impressions: 0 }), // did not run
];

test("the campaign highlights name the best, the lowest and the most costly", () => {
  const h = campaignHighlights(LINES);

  assert.equal(h.total, 4); // "off" did not run
  assert.equal(h.active, 3);
  assert.equal(h.best?.id, "brand");
  assert.equal(h.lowest?.id, "lv"); // spent £174 and got nothing
  assert.equal(h.mostCostly?.id, "eu");
  assert.equal(Math.round(h.mostCostlyShare), 47); // 872 of 1846
});

test("the lowest is the fewest conversions when every campaign converts", () => {
  assert.equal(campaignHighlights(LINES.filter((c) => c.id !== "lv")).lowest?.id, "uk");

  // bookairtravel's week to 6 Oct: the big campaign is the dearer per
  // conversion but still the best; the small one is the lowest.
  const week = campaignHighlights([
    line("eu", { cost: 815.95, conversions: 8 }),
    line("flights", { cost: 45.23, conversions: 1 }),
  ]);
  assert.equal(week.best?.id, "eu");
  assert.equal(week.lowest?.id, "flights");
});

test("ties go to the cheaper for best and the dearer for lowest", () => {
  const h = campaignHighlights([line("a", { cost: 300, conversions: 0 }), line("b", { cost: 90, conversions: 0 })]);
  assert.equal(h.best, null);
  assert.equal(h.lowest?.id, "a");
  assert.deepEqual(
    orderCampaigns([line("a", { cost: 300, conversions: 4 }), line("b", { cost: 90, conversions: 4 })], "best").map((c) => c.id),
    ["b", "a"]
  );
});

test("no title is given where it would mean nothing", () => {
  assert.equal(campaignHighlights([line("a", { cost: 50, conversions: 0 })]).best, null);
  assert.equal(campaignHighlights([line("a", { cost: 50, conversions: 2 })]).lowest, null);
  const none = campaignHighlights([]);
  assert.deepEqual([none.total, none.best, none.lowest, none.mostCostly], [0, null, null, null]);
});

test("campaigns can be ordered by spend, best results or weakest results", () => {
  const ids = (order: Parameters<typeof orderCampaigns>[1]) => orderCampaigns(LINES, order).map((c) => c.id);

  assert.deepEqual(ids("spend"), ["eu", "brand", "lv", "uk", "off"]);
  assert.deepEqual(ids("best"), ["brand", "eu", "uk", "lv", "off"]);
  assert.deepEqual(ids("lowest"), ["lv", "uk", "eu", "brand", "off"]);
});
