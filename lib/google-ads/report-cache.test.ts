import test from "node:test";
import assert from "node:assert/strict";

import { reportCacheKey, withReportCache } from "./report-cache.ts";

test("a repeated query is served without asking Google again", async () => {
  // This is the whole point: an Explorer token allows 2,880 operations a day
  // across every agency, and each dashboard view asks for two windows.
  let calls = 0;
  const load = async () => {
    calls += 1;
    return { rows: calls };
  };

  const key = reportCacheKey(["customer-1", "manager-1", "2026-09-01", "2026-09-07"]);

  const first = await withReportCache(key, load);
  const second = await withReportCache(key, load);

  assert.equal(calls, 1);
  assert.deepEqual(second, first);
});

test("different customers never share an entry", async () => {
  const keyA = reportCacheKey(["customer-a", "manager-1", "2026-09-01", "2026-09-07"]);
  const keyB = reportCacheKey(["customer-b", "manager-1", "2026-09-01", "2026-09-07"]);

  assert.notEqual(keyA, keyB);

  const a = await withReportCache(keyA, async () => "a");
  const b = await withReportCache(keyB, async () => "b");

  assert.equal(a, "a");
  assert.equal(b, "b");
});

test("different periods for one customer are cached apart", async () => {
  const week = reportCacheKey(["customer-c", "m", "2026-09-17", "2026-09-23"]);
  const prior = reportCacheKey(["customer-c", "m", "2026-09-10", "2026-09-16"]);

  assert.notEqual(week, prior);

  assert.equal(await withReportCache(week, async () => "current"), "current");
  assert.equal(await withReportCache(prior, async () => "previous"), "previous");
});

test("a missing part cannot collide with a present one", () => {
  assert.notEqual(
    reportCacheKey(["customer", null, "2026-09-01", "2026-09-07"]),
    reportCacheKey(["customer", "2026-09-01", "2026-09-07", null])
  );
});
