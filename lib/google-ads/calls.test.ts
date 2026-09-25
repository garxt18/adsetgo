import test from "node:test";
import assert from "node:assert/strict";

import type { CallRow } from "./auth.ts";
import { buildCallReport, callsByCampaign, callsByDay, summarizeCalls } from "./calls.ts";
import { resolveRange } from "./date-range.ts";
import { buildSampleCalls } from "./sample-data.ts";

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
