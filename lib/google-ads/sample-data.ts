import type { CallRow, GoogleAdsRow } from "./auth.ts";
import { eachDay } from "./date-range.ts";

/**
 * Generated report rows, for building and demonstrating the product before a
 * Google Ads account with real traffic exists.
 *
 * Two rules make this safe, and both are enforced rather than remembered:
 *
 * 1. It is refused outside development (`isSampleDataEnabled`), and the
 *    variables that switch it on also fail a deployment build, the same way
 *    the local login shortcut does.
 * 2. Every response it feeds is flagged `isSample`, and the dashboards print a
 *    banner saying the figures are not from Google Ads. A number that cannot
 *    announce itself as invented has no business on a client's screen.
 *
 * Rows come back in the shape Google returns, so summarising, trends, campaign
 * grouping and period comparison all run the same code they run in production.
 */

const CAMPAIGNS = [
  { id: "1001", name: "Search — Brand", weight: 0.34, status: "ENABLED" },
  { id: "1002", name: "Search — Competitors", weight: 0.24, status: "ENABLED" },
  { id: "1003", name: "Performance Max — Retail", weight: 0.22, status: "ENABLED" },
  { id: "1004", name: "Display — Remarketing", weight: 0.14, status: "ENABLED" },
  { id: "1005", name: "Video — Awareness", weight: 0.06, status: "PAUSED" },
];

/** Small deterministic generator: the same account and day always agree. */
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}


/** Only ever true outside production, and only when explicitly switched on. */
export function isSampleDataEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.SAMPLE_DATA?.trim() === "1";
}

export function buildSampleRows({
  customerId,
  startDate,
  endDate,
}: {
  customerId: string;
  startDate: string;
  endDate: string;
}): GoogleAdsRow[] {
  const days = eachDay(startDate, endDate);
  const rows: GoogleAdsRow[] = [];

  for (const day of days) {
    // Seeded per account and day, so a date range and the period before it
    // share the days they overlap and comparisons stay stable across reloads.
    const random = mulberry32(seedFrom(`${customerId}:${day}`));

    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const dayFactor = (weekend ? 0.62 : 1) * (0.85 + random() * 0.3);

    for (const campaign of CAMPAIGNS) {
      if (campaign.status === "PAUSED" && random() > 0.35) continue;

      const impressions = Math.round(4200 * campaign.weight * dayFactor * (0.9 + random() * 0.2));
      const ctr = 0.031 + random() * 0.022;
      const clicks = Math.max(1, Math.round(impressions * ctr));
      const cpc = 0.9 + random() * 1.4;
      const cost = clicks * cpc;
      const conversionRate = 0.045 + random() * 0.05;
      const conversions = Math.round(clicks * conversionRate);

      rows.push({
        campaign: { id: campaign.id, name: campaign.name, status: campaign.status },
        segments: { date: day },
        // Shaped exactly as Google's reply (camelCase, numbers as strings),
        // so sample mode exercises the same reading code live data does.
        metrics: {
          impressions: String(impressions),
          clicks: String(clicks),
          costMicros: String(Math.round(cost * 1_000_000)),
          conversions,
          conversionsValue: conversions * (48 + random() * 90),
        },
      });
    }
  }

  return rows;
}

/**
 * Generated calls in call_view's shape. Seeded on their own ("calls:"), so
 * adding them left the generated spend and clicks exactly as they were.
 */
export function buildSampleCalls({
  customerId,
  startDate,
  endDate,
}: {
  customerId: string;
  startDate: string;
  endDate: string;
}): CallRow[] {
  const rows: CallRow[] = [];
  // Search and Performance Max ads carry call assets; video rarely does.
  const calling = CAMPAIGNS.filter((campaign) => !campaign.name.startsWith("Video"));
  const totalWeight = calling.reduce((sum, campaign) => sum + campaign.weight, 0);

  for (const day of eachDay(startDate, endDate)) {
    const random = mulberry32(seedFrom(`${customerId}:calls:${day}`));
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const count = Math.round((weekday === 0 || weekday === 6 ? 3 : 9) * (0.6 + random() * 0.8));

    for (let i = 0; i < count; i += 1) {
      let pick = random() * totalWeight;
      const campaign = calling.find((c) => (pick -= c.weight) <= 0) ?? calling[0];
      const missed = random() < 0.24;
      const hour = String(9 + Math.floor(random() * 10)).padStart(2, "0");
      const minute = String(Math.floor(random() * 60)).padStart(2, "0");

      rows.push({
        campaign: { id: campaign.id, name: campaign.name },
        callView: {
          startCallDateTime: `${day} ${hour}:${minute}:00`,
          callStatus: missed ? "MISSED" : "RECEIVED",
          callDurationSeconds: String(missed ? 0 : 35 + Math.round(random() * 420)),
          callTrackingDisplayLocation: random() < 0.72 ? "AD" : "LANDING_PAGE",
        },
      });
    }
  }

  return rows;
}
