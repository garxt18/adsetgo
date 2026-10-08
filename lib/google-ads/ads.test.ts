import test from "node:test";
import assert from "node:assert/strict";

import { adHeadline, adHighlights, buildAdsReport, rankBy, readableHeadline } from "./ads.ts";
import type { AdRow, KeywordRow } from "./auth.ts";
import { resolveRange } from "./date-range.ts";
import { buildSampleAds, buildSampleKeywords } from "./sample-data.ts";

function ad(id: string, campaign: string, m: { impressions: number; clicks: number; cost: number; conversions: number }): AdRow {
  return {
    campaign: { id: campaign, name: `Campaign ${campaign}` },
    adGroup: { id: "g1", name: "Flight Booking" },
    adGroupAd: { status: "ENABLED", ad: { id, responsiveSearchAd: { headlines: [{ text: `Ad ${id}` }] } } },
    metrics: {
      impressions: String(m.impressions),
      clicks: String(m.clicks),
      costMicros: String(m.cost * 1_000_000),
      conversions: m.conversions,
    },
  };
}

test("an ad reads as its first three headlines, pinned ones in place", () => {
  // As bookairtravel's ad arrives: the headline pinned first is listed first.
  assert.equal(
    adHeadline({
      responsiveSearchAd: {
        headlines: [
          { text: "Book International Flights" },
          { text: "UK Flight Booking Service" },
          { text: "bookairtravel.net", pinnedField: "HEADLINE_1" },
          { text: "Book Flights From The UK" },
        ],
      },
    }),
    "bookairtravel.net | Book International Flights | UK Flight Booking Service"
  );
  assert.equal(adHeadline({ expandedTextAd: { headlinePart1: "Cheap Flights", headlinePart2: "Book Now" } }), "Cheap Flights | Book Now");
  assert.equal(adHeadline({ type: "VIDEO_RESPONSIVE_AD", name: "Spring launch" }), "Spring launch");
  assert.equal(adHeadline({ type: "IMAGE_AD" }), "Image ad");
  assert.equal(adHeadline(undefined), "Ad");
});

test("insertion codes read as the ad shows them", () => {
  // As written in bookairtravel's ads.
  assert.equal(readableHeadline("{LOCATION(City)} to Phillipines"), "[city] to Phillipines");
  assert.equal(readableHeadline("{KeyWord:London To Edinburgy}"), "London To Edinburgy");
  assert.equal(readableHeadline("Save on {CUSTOMIZER.discount:big} deals"), "Save on big deals");
  assert.equal(readableHeadline("Flights From {LOCATION(Country)}"), "Flights From [country]");
  assert.equal(readableHeadline("Plain headline"), "Plain headline");
});

test("the report reads an ad's figures, campaign and ad group", () => {
  const report = buildAdsReport({
    range: resolveRange("last_30_days"),
    adRows: [ad("1", "c1", { impressions: 15447, clicks: 552, cost: 2210.17, conversions: 61 })],
    keywordRows: [],
    isSample: false,
    currency: "GBP",
  });
  const [line] = report.ads;

  assert.equal(line.id, "g1~1");
  assert.equal(line.headline, "Ad 1");
  assert.equal(line.campaign, "Campaign c1");
  assert.equal(line.adGroup, "Flight Booking");
  assert.deepEqual(
    [line.impressions, line.clicks, line.cost, line.conversions, line.costPerConversion, line.ctr],
    [15447, 552, 2210.17, 61, 36.23, 3.57]
  );
  assert.equal(report.currency, "GBP");
});

test("highlights name the best ad, the widest reach and the most clicks", () => {
  const { ads } = buildAdsReport({
    range: resolveRange("last_7_days"),
    adRows: [
      ad("seen", "c1", { impressions: 9000, clicks: 120, cost: 300, conversions: 2 }),
      ad("sells", "c1", { impressions: 3000, clicks: 140, cost: 280, conversions: 9 }),
      ad("quiet", "c2", { impressions: 400, clicks: 0, cost: 0, conversions: 0 }),
    ],
    keywordRows: [],
    isSample: false,
    currency: "GBP",
  });
  const h = adHighlights(ads);

  assert.deepEqual([h.total, h.campaigns], [3, 2]);
  assert.equal(h.best?.headline, "Ad sells");
  assert.equal(h.reach?.headline, "Ad seen");
  assert.equal(h.clicks?.headline, "Ad sells");
  assert.deepEqual(ads.map((a) => a.headline), ["Ad sells", "Ad seen", "Ad quiet"]);
});

test("no highlight is named where it would mean nothing", () => {
  const { ads } = buildAdsReport({
    range: resolveRange("last_7_days"),
    adRows: [ad("a", "c1", { impressions: 50, clicks: 0, cost: 0, conversions: 0 })],
    keywordRows: [],
    isSample: false,
    currency: "GBP",
  });
  const h = adHighlights(ads);
  assert.deepEqual([h.best, h.clicks, h.reach?.headline], [null, null, "Ad a"]);
  assert.deepEqual(adHighlights([]), { total: 0, campaigns: 0, best: null, reach: null, clicks: null });
});

test("ties go to more conversions, then more clicks, then the cheaper", () => {
  const line = (id: string, conversions: number, clicks: number, cost: number) => ({ id, impressions: 100, conversions, clicks, cost });
  const order = rankBy([line("a", 3, 10, 50), line("b", 3, 12, 80), line("c", 3, 12, 40), line("d", 5, 1, 99)], "conversions");
  assert.deepEqual(order.map((x) => x.id), ["d", "c", "b", "a"]);
});

test("keywords read their text, match type, campaign and ad group, best first", () => {
  const keyword = (id: string, text: string, matchType: string, conversions: number): KeywordRow => ({
    campaign: { id: "c1", name: "EU Travel Campaign | REBUILT" },
    adGroup: { id: "g1", name: "Flight Booking" },
    adGroupCriterion: { criterionId: id, status: "PAUSED", keyword: { text, matchType } },
    metrics: { impressions: "3076", clicks: "100", costMicros: "331884972", conversions },
  });
  const { keywords } = buildAdsReport({
    range: resolveRange("last_30_days"),
    adRows: [],
    keywordRows: [keyword("1", "cheap flights", "BROAD", 4), keyword("2", "flight ticket booking", "PHRASE", 16)],
    isSample: false,
    currency: "GBP",
  });

  assert.deepEqual(
    keywords.map((k) => [k.id, k.text, k.matchType, k.status, k.campaign, k.adGroup, k.conversions]),
    [
      ["g1~2", "flight ticket booking", "Phrase", "PAUSED", "EU Travel Campaign | REBUILT", "Flight Booking", 16],
      ["g1~1", "cheap flights", "Broad", "PAUSED", "EU Travel Campaign | REBUILT", "Flight Booking", 4],
    ]
  );
  assert.equal(keywords[0].cost, 331.88);
});

test("sample ads and keywords are stable and skip Performance Max", () => {
  const args = { customerId: "1234567890", startDate: "2026-09-01", endDate: "2026-09-30" };
  assert.deepEqual(buildSampleAds(args), buildSampleAds(args));
  assert.ok(buildSampleAds(args).every((row) => !row.campaign?.name?.startsWith("Performance Max")));
  assert.ok(buildSampleKeywords(args).every((row) => Number(row.metrics?.impressions) > 0));
});
