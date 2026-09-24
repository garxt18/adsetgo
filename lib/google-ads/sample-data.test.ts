import test from "node:test";
import assert from "node:assert/strict";

import { buildSampleRows, isSampleDataEnabled } from "./sample-data.ts";

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("generated figures are refused in production, even if switched on", () => {
  // The banner tells a reader the figures are invented; this makes sure a
  // real deployment can never reach the code that produces them.
  withEnv({ NODE_ENV: "production", SAMPLE_DATA: "1" }, () => {
    assert.equal(isSampleDataEnabled(), false);
  });
});

test("generated figures are off unless explicitly switched on", () => {
  withEnv({ NODE_ENV: "development", SAMPLE_DATA: undefined }, () => {
    assert.equal(isSampleDataEnabled(), false);
  });

  withEnv({ NODE_ENV: "development", SAMPLE_DATA: "0" }, () => {
    assert.equal(isSampleDataEnabled(), false);
  });

  withEnv({ NODE_ENV: "development", SAMPLE_DATA: "1" }, () => {
    assert.equal(isSampleDataEnabled(), true);
  });
});

test("the same account and period always produce the same figures", () => {
  const args = { customerId: "3583125339", startDate: "2026-09-01", endDate: "2026-09-07" };
  const first = buildSampleRows(args);
  const second = buildSampleRows(args);

  assert.deepEqual(first, second);
});

test("different accounts do not share figures", () => {
  const range = { startDate: "2026-09-01", endDate: "2026-09-07" };
  const a = buildSampleRows({ customerId: "1111111111", ...range });
  const b = buildSampleRows({ customerId: "2222222222", ...range });

  assert.notDeepEqual(a, b);
});

test("rows cover every day of the range and carry usable metrics", () => {
  const rows = buildSampleRows({
    customerId: "3583125339",
    startDate: "2026-09-01",
    endDate: "2026-09-07",
  });

  const dates = new Set(rows.map((row) => row.segments?.date));
  assert.equal(dates.size, 7);

  for (const row of rows) {
    assert.ok(Number(row.metrics?.impressions) > 0);
    assert.ok(Number(row.metrics?.clicks) > 0);
    assert.ok(Number(row.metrics?.cost_micros) > 0);
    // Clicks can never exceed impressions, or every derived rate is nonsense.
    assert.ok(Number(row.metrics?.clicks) <= Number(row.metrics?.impressions));
  }
});
