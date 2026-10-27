import test from "node:test";
import assert from "node:assert/strict";

import type { CallActionRow, CallRow, ConversionRow } from "./auth.ts";
import {
  buildCallReport,
  callActions,
  callConversions,
  callRule,
  callsByCampaign,
  callsByDay,
  summarizeCalls,
} from "./calls.ts";
import { resolveRange } from "./date-range.ts";
import { buildSampleCallActions, buildSampleCalls, buildSampleConversions } from "./sample-data.ts";

function call(at: string, status: "RECEIVED" | "MISSED", seconds: number, campaign = "1", where = "AD"): CallRow {
  return {
    campaign: { id: campaign, name: `Campaign ${campaign}` },
    callView: {
      startCallDateTime: at,
      callStatus: status,
      callDurationSeconds: String(seconds),
      callTrackingDisplayLocation: where,
    },
  };
}

const CALLS = [
  call("2026-03-01 10:00:00", "RECEIVED", 120),
  call("2026-03-01 11:30:00", "MISSED", 0, "2"),
  call("2026-03-03 09:15:00", "RECEIVED", 60, "1", "LANDING_PAGE"),
  call("2026-03-03 16:45:00", "MISSED", 0),
];

test("calls split into answered and missed, with length over answered calls only", () => {
  const s = summarizeCalls(CALLS);

  assert.equal(s.calls, 4);
  assert.equal(s.answered, 2);
  assert.equal(s.missed, 2);
  assert.equal(s.answerRate, 50);
  // (120 + 60) / 2: a missed call's zero seconds must not drag the average down.
  assert.equal(s.averageDuration, 90);
  assert.equal(s.fromAd, 3);
  assert.equal(s.fromWebsite, 1);
});

test("no calls is zeros, never NaN", () => {
  const s = summarizeCalls([]);
  assert.deepEqual([s.calls, s.answerRate, s.averageDuration], [0, 0, 0]);
});

test("every day of the window has a point, quiet days included", () => {
  const days = callsByDay(CALLS, "2026-03-01", "2026-03-04");

  assert.deepEqual(
    days.map((d) => [d.date, d.calls, d.answered]),
    [
      ["2026-03-01", 2, 1],
      ["2026-03-02", 0, 0],
      ["2026-03-03", 2, 1],
      ["2026-03-04", 0, 0],
    ]
  );
});

test("campaigns are ranked by how many calls they brought", () => {
  const campaigns = callsByCampaign(CALLS);

  assert.equal(campaigns[0].name, "Campaign 1");
  assert.equal(campaigns[0].calls, 3);
  assert.equal(campaigns[1].calls, 1);
});

test("sample calls run through the same report, one point per day", () => {
  const range = resolveRange("last_14_days", new Date("2026-03-20T09:00:00Z"));
  const rows = buildSampleCalls({ customerId: "1234567890", startDate: range.start, endDate: range.end });
  const previousRows = buildSampleCalls({
    customerId: "1234567890",
    startDate: range.previousStart,
    endDate: range.previousEnd,
  });

  const report = buildCallReport({ range, rows, previousRows, isSample: true });

  assert.equal(report.byDay.length, 14);
  assert.ok(report.summary.calls > 0);
  assert.equal(report.summary.calls, report.byDay.reduce((sum, d) => sum + d.calls, 0));
  assert.equal(report.summary.answered + report.summary.missed, report.summary.calls);
  assert.equal(typeof report.changes.calls, "number");
});

const AD_ACTION = "customers/1/conversionActions/4";
const SITE_ACTION = "customers/1/conversionActions/5";

function callAction(id: string, type: string, seconds: number | string | undefined, counting: string, extra = {}): CallActionRow {
  return {
    conversionAction: {
      resourceName: id,
      name: type === "AD_CALL" ? "Calls from ads" : "Calls from website",
      type,
      status: "ENABLED",
      countingType: counting,
      phoneCallDurationSeconds: seconds,
      primaryForGoal: true,
      ...extra,
    },
  };
}

function converted(action: string, conversions: number, allConversions = conversions): ConversionRow {
  return {
    campaign: { id: "1", name: "Campaign 1" },
    segments: { conversionAction: action, conversionActionCategory: "PHONE_CALL_LEAD" },
    metrics: { conversions, allConversions },
  };
}

test("an action's rules read as a sentence", () => {
  assert.equal(callRule({ minimumSeconds: 60, oncePerClick: true }), "Calls of 1 minute or longer, once per ad click");
  assert.equal(callRule({ minimumSeconds: 90, oncePerClick: false }), "Calls of 90 seconds or longer, every call");
  assert.equal(callRule({ minimumSeconds: 120, oncePerClick: false }), "Calls of 2 minutes or longer, every call");
  assert.equal(callRule({ minimumSeconds: 0, oncePerClick: true }), "Calls of any length, once per ad click");
});

test("a missing call length falls back to Google's 60 seconds; int64 strings are read", () => {
  const [unset, set] = callActions([
    callAction(AD_ACTION, "AD_CALL", undefined, "ONE_PER_CLICK"),
    callAction(SITE_ACTION, "WEBSITE_CALL", "45", "MANY_PER_CLICK"),
  ]);
  assert.equal(unset.minimumSeconds, 60);
  assert.equal(unset.source, "ad");
  assert.equal(set.minimumSeconds, 45);
  assert.equal(set.source, "website");
  assert.equal(set.oncePerClick, false);
});

test("counted calls set against the calls long enough, per action and its source", () => {
  // From the ad: 120s and 30s answered, two missed. From the website: 60s answered.
  const calls = [...CALLS, call("2026-03-02 12:00:00", "RECEIVED", 30)];
  const result = callConversions(
    calls,
    [converted(AD_ACTION, 0.6), converted(AD_ACTION, 0.4), converted(SITE_ACTION, 1)],
    [
      callAction(AD_ACTION, "AD_CALL", 60, "ONE_PER_CLICK"),
      callAction(SITE_ACTION, "WEBSITE_CALL", 90, "MANY_PER_CLICK"),
    ]
  );

  assert.equal(result.counted, 2);
  const [ad, site] = result.actions;
  assert.deepEqual([ad.id, ad.calls, ad.longEnough, ad.conversions], [AD_ACTION, 4, 1, 1]);
  // 60 seconds is short of this action's 90, so none of its calls qualify by length.
  assert.deepEqual([site.id, site.calls, site.longEnough, site.conversions], [SITE_ACTION, 1, 0, 1]);
  assert.equal(ad.rule, "Calls of 1 minute or longer, once per ad click");
});

test("a removed action shows only if it still counted something; secondary ones add nothing", () => {
  const result = callConversions(
    CALLS,
    [converted(SITE_ACTION, 0, 3)],
    [
      callAction(AD_ACTION, "AD_CALL", 60, "ONE_PER_CLICK", { status: "REMOVED" }),
      callAction(SITE_ACTION, "WEBSITE_CALL", 60, "ONE_PER_CLICK", { primaryForGoal: false }),
    ]
  );

  assert.deepEqual(result.actions.map((a) => a.id), [SITE_ACTION]);
  assert.equal(result.actions[0].primary, false);
  assert.equal(result.actions[0].allConversions, 3);
  assert.equal(result.counted, 0);
});

test("without conversion data the call report still builds, with nothing claimed", () => {
  const range = resolveRange("last_7_days", new Date("2026-03-20T09:00:00Z"));
  assert.equal(buildCallReport({ range, rows: CALLS, previousRows: [], isSample: true }).conversions, null);
});

test("sample calls and sample conversions agree on the call action", () => {
  const range = resolveRange("last_14_days", new Date("2026-03-20T09:00:00Z"));
  const args = { customerId: "1234567890", startDate: range.start, endDate: range.end };
  const report = buildCallReport({
    range,
    rows: buildSampleCalls(args),
    previousRows: [],
    isSample: true,
    conversions: { rows: buildSampleConversions(args), actions: buildSampleCallActions(args.customerId) },
  });

  const fromAds = report.conversions!.actions.find((a) => a.source === "ad")!;
  assert.ok(fromAds.conversions > 0);
  assert.ok(fromAds.longEnough <= fromAds.calls);
  assert.equal(report.conversions!.counted, report.conversions!.actions.reduce((sum, a) => sum + a.conversions, 0));
});
