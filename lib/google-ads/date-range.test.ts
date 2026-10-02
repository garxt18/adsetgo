import test from "node:test";
import assert from "node:assert/strict";

import { checkCustomRange, percentChange, resolveRange, shortDay, span } from "./date-range.ts";

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

test("a report day reads the same in every time zone", () => {
  // Midnight UTC is still the previous evening in New York; the label must
  // not slip back a day for a reader there.
  const zone = process.env.TZ;
  try {
    for (const tz of ["America/Los_Angeles", "Asia/Kolkata", "Pacific/Auckland"]) {
      process.env.TZ = tz;
      assert.equal(shortDay("2026-03-01"), "1 Mar", tz);
    }
  } finally {
    process.env.TZ = zone;
  }
});

test("a period reads as a span, with the year only when asked", () => {
  assert.equal(span("2026-03-01", "2026-03-07"), "1 Mar – 7 Mar 2026");
  assert.equal(span("2026-03-01", "2026-03-07", false), "1 Mar – 7 Mar");
  assert.equal(shortDay("not a date"), "not a date");
  // A single day reads as that day.
  assert.equal(span("2026-09-10", "2026-09-10"), "10 Sept 2026");
  assert.equal(span("2026-09-10", "2026-09-10", false), "10 Sept");
});

test("a custom range covers exactly the chosen days, compared with as many before", () => {
  const range = resolveRange("2026-09-01..2026-09-15", NOW);

  assert.equal(range.key, "custom");
  assert.equal(range.start, "2026-09-01");
  assert.equal(range.end, "2026-09-15");
  assert.equal(days(range.start, range.end), 15);
  assert.equal(range.previousEnd, "2026-08-31");
  assert.equal(days(range.previousStart, range.previousEnd), 15);
});

test("a single day is a valid range", () => {
  const range = resolveRange("2026-09-10..2026-09-10", NOW);
  assert.equal(range.key, "custom");
  assert.equal(range.previousStart, "2026-09-09");
});

test("a custom range that cannot be used is refused with a reason", () => {
  // NOW is 24 September, so the 23rd is the last day with complete figures.
  assert.equal(checkCustomRange("2026-09-01", "2026-09-23", NOW).ok, true);

  for (const [start, end] of [
    ["2026-09-15", "2026-09-01"], // backwards
    ["2026-09-01", "2026-09-24"], // includes today
    ["2026-09-01", "2026-10-30"], // the future
    ["2025-01-01", "2026-09-01"], // more than 366 days
    ["2026-02-30", "2026-03-05"], // not a real date
    ["", "2026-09-05"],
  ]) {
    const result = checkCustomRange(start, end, NOW);
    assert.equal(result.ok, false, `${start}..${end}`);
  }
});

test("the server falls back to the default week for a range it would refuse", () => {
  for (const bad of ["2026-09-15..2026-09-01", "2026-09-01..2026-12-01", "2026-9-1..2026-9-5"]) {
    assert.equal(resolveRange(bad, NOW).key, "last_7_days", bad);
  }
});
