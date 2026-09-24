import test from "node:test";
import assert from "node:assert/strict";

import { percentChange, resolveRange } from "./date-range.ts";

// A fixed "now" so these assertions do not drift with the calendar.
const NOW = new Date("2026-09-24T09:00:00Z");

function days(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

test("a range ends yesterday, never today", () => {
  // Google reports the current day only partially, and a half-written day
  // makes every comparison look like a collapse.
  assert.equal(resolveRange("last_7_days", NOW).end, "2026-09-23");
});

test("last 7 days covers seven days", () => {
  const range = resolveRange("last_7_days", NOW);
  assert.equal(range.start, "2026-09-17");
  assert.equal(days(range.start, range.end), 7);
});

test("the prior window is the same length and immediately precedes", () => {
  for (const key of ["last_7_days", "last_14_days", "last_30_days"]) {
    const range = resolveRange(key, NOW);

    assert.equal(
      days(range.start, range.end),
      days(range.previousStart, range.previousEnd),
      `${key}: windows must match in length`
    );
    assert.equal(
      days(range.previousEnd, range.start),
      2,
      `${key}: prior window must end the day before the current one starts`
    );
  }
});

test("last month is the whole previous calendar month", () => {
  const range = resolveRange("last_month", NOW);
  assert.equal(range.start, "2026-08-01");
  assert.equal(range.end, "2026-08-31");
  assert.equal(range.previousStart, "2026-07-01");
  assert.equal(range.previousEnd, "2026-07-31");
});

test("this month runs from the first to yesterday", () => {
  const range = resolveRange("this_month", NOW);
  assert.equal(range.start, "2026-09-01");
  assert.equal(range.end, "2026-09-23");
});

test("an unknown range falls back to seven days rather than throwing", () => {
  assert.equal(resolveRange("nonsense", NOW).key, "last_7_days");
});

test("percent change reports null when there is nothing to compare against", () => {
  // A jump from zero is not "infinite growth"; the UI shows "No prior period".
  assert.equal(percentChange(10, 0), null);
  assert.equal(percentChange(Number.NaN, 5), null);
});

test("percent change is signed and relative to the prior figure", () => {
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(50, 100), -50);
  assert.equal(percentChange(100, 100), 0);
});
