import test from "node:test";
import assert from "node:assert/strict";

import { buildAlerts, type AlertCampaign, type AlertMetrics } from "./insights.ts";

const money = (value: number) => `₹${Math.round(value)}`;

function metrics(overrides: Partial<AlertMetrics> = {}): AlertMetrics {
  return {
    cost: 10000,
    conversions: 100,
    costPerConversion: 100,
    conversionRate: 5,
    clicks: 2000,
    ...overrides,
  };
}

const noCampaigns: AlertCampaign[] = [];

test("nothing is claimed without a period to compare against", () => {
  const alerts = buildAlerts({
    metrics: metrics(),
    previousMetrics: null,
    campaigns: noCampaigns,
    previousCampaigns: noCampaigns,
    formatCurrency: money,
  });

  assert.deepEqual(alerts, []);
});

test("a small wobble is not worth saying out loud", () => {
  // Flagging every movement trains people to ignore the whole strip.
  const alerts = buildAlerts({
    metrics: metrics({ cost: 10400, conversions: 104, costPerConversion: 100 }),
    previousMetrics: metrics(),
    campaigns: noCampaigns,
    previousCampaigns: noCampaigns,
    formatCurrency: money,
  });

  assert.deepEqual(alerts, []);
});

test("a big swing on tiny numbers is noise, not news", () => {
  // Two conversions becoming four is a 100% rise and means nothing.
  const alerts = buildAlerts({
    metrics: metrics({ conversions: 4, costPerConversion: 50, cost: 200 }),
    previousMetrics: metrics({ conversions: 2, costPerConversion: 100, cost: 200 }),
    campaigns: noCampaigns,
    previousCampaigns: noCampaigns,
    formatCurrency: money,
  });

  assert.equal(
    alerts.find((a) => a.id === "cpa"),
    undefined
  );
});

test("a dearer conversion is flagged as a caution", () => {
  const alerts = buildAlerts({
    metrics: metrics({ costPerConversion: 140 }),
    previousMetrics: metrics({ costPerConversion: 100 }),
    campaigns: noCampaigns,
    previousCampaigns: noCampaigns,
    formatCurrency: money,
  });

  const cpa = alerts.find((a) => a.id === "cpa");
  assert.ok(cpa);
  assert.equal(cpa.tone, "caution");
  assert.match(cpa.headline, /40% more/);
});

test("a cheaper conversion is good news, not a warning", () => {
  const alerts = buildAlerts({
    metrics: metrics({ costPerConversion: 60 }),
    previousMetrics: metrics({ costPerConversion: 100 }),
    campaigns: noCampaigns,
    previousCampaigns: noCampaigns,
    formatCurrency: money,
  });

  const cpa = alerts.find((a) => a.id === "cpa");
  assert.ok(cpa);
  assert.equal(cpa.tone, "positive");
  assert.match(cpa.headline, /40% less/);
});

test("spending more is only a worry when results did not follow", () => {
  const followed = buildAlerts({
    metrics: metrics({ cost: 15000, conversions: 150 }),
    previousMetrics: metrics({ cost: 10000, conversions: 100 }),
    campaigns: noCampaigns,
    previousCampaigns: noCampaigns,
    formatCurrency: money,
  }).find((a) => a.id === "spend");

  assert.equal(followed?.tone, "positive");

  const didNot = buildAlerts({
    metrics: metrics({ cost: 15000, conversions: 100, costPerConversion: 150 }),
    previousMetrics: metrics({ cost: 10000, conversions: 100, costPerConversion: 100 }),
    campaigns: noCampaigns,
    previousCampaigns: noCampaigns,
    formatCurrency: money,
  }).find((a) => a.id === "spend");

  assert.equal(didNot?.tone, "caution");
  assert.match(didNot?.detail ?? "", /without a matching rise/);
});

test("the campaign that moved most is named", () => {
  const alerts = buildAlerts({
    metrics: metrics({ cost: 15000, conversions: 100, costPerConversion: 150 }),
    previousMetrics: metrics({ cost: 10000, conversions: 100, costPerConversion: 100 }),
    campaigns: [
      { id: "1", name: "Search — Brand", cost: 4000, conversions: 60 },
      { id: "2", name: "Display — Remarketing", cost: 11000, conversions: 40 },
    ],
    previousCampaigns: [
      { id: "1", name: "Search — Brand", cost: 3800, conversions: 60 },
      { id: "2", name: "Display — Remarketing", cost: 6200, conversions: 40 },
    ],
    formatCurrency: money,
  });

  const spend = alerts.find((a) => a.id === "spend");
  assert.match(spend?.detail ?? "", /Display — Remarketing/);
  assert.match(spend?.detail ?? "", /up/);
});

test("at most three are shown, so the strip stays readable", () => {
  const alerts = buildAlerts({
    metrics: metrics({ cost: 30000, conversions: 60, costPerConversion: 500 }),
    previousMetrics: metrics({ cost: 10000, conversions: 100, costPerConversion: 100 }),
    campaigns: noCampaigns,
    previousCampaigns: noCampaigns,
    formatCurrency: money,
  });

  assert.ok(alerts.length <= 3);
});
