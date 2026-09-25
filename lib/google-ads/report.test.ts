import test from "node:test";
import assert from "node:assert/strict";

import type { GoogleAdsRow } from "./auth.ts";
import { resolveRange } from "./date-range.ts";
import { buildReport, groupByCampaign, groupByDay, summarize } from "./report.ts";
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

  const report = buildReport({ range, rows: ROWS, previousRows: previous, isSample: false });

  assert.equal(report.changes.cost, -50);
  // Conversions went from 0 to 10: there is no percentage for that, not "Infinity%".
  assert.equal(report.changes.conversions, null);
  assert.equal("key" in report.period, false);
  assert.equal(report.period.start, range.start);
});

test("sample rows go through the same arithmetic, one trend point per day", () => {
  const range = resolveRange("last_14_days", new Date("2026-03-20T09:00:00Z"));
  const rows = buildSampleRows({ customerId: "1234567890", startDate: range.start, endDate: range.end });

  const report = buildReport({ range, rows, previousRows: [], isSample: true });

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
