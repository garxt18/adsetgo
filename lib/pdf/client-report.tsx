/**
 * The client's report as a PDF: everything on their dashboard -- the summary,
 * alerts, all eight figures with their changes, the daily trends, campaigns,
 * calls, ads and keywords -- plus a day-by-day table, since paper has no hover to read
 * exact values from a chart.
 */

import { Text, View } from "@react-pdf/renderer";

import { adHighlights, type AdsReport } from "../google-ads/ads.ts";
import type { CallReport } from "../google-ads/calls.ts";
import { formatGoogleAdsCustomerId } from "../google-ads/format.ts";
import { shortDay, span } from "../google-ads/date-range.ts";
import { campaignHighlights, type buildReport } from "../google-ads/report.ts";
import { formatCurrency, formatNumber, formatPercent } from "../format.ts";
import { buildAlerts } from "../insights.ts";
import {
  MEASURES,
  TILE_METRICS,
  adHighlightTiles,
  highlightTiles,
  summarise,
  type MetricKey,
} from "../report-copy.ts";
import {
  BarList,
  C,
  LineChart,
  Notice,
  ReportDocument,
  ReportHeader,
  SAMPLE_NOTICE,
  Section,
  Table,
  TileGrid,
  generatedAt,
  s,
} from "./kit.tsx";

type Report = ReturnType<typeof buildReport>;

/** A light tint of the brand for missed calls: one measure split two ways, not a second hue. */
const MISSED = "#a9c6f5";

/** 248 seconds reads as "4:08". */
function minutes(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ClientReportPdf({
  client,
  report,
  calls,
  ads,
}: {
  client: { name: string; agencyName: string; customerId: string };
  report: Report;
  /** Null when Google could not be asked for calls; the rest still prints. */
  calls: CallReport | null;
  /** Null when Google could not be asked for ads and keywords, as with calls. */
  ads: AdsReport | null;
}) {
  const { metrics, previousMetrics, changes, trend, previousTrend, campaigns, previousCampaigns, period } = report;
  // Every amount in the account's own currency, and counts grouped to match.
  const { currency } = report;
  const money = (value: number) => formatCurrency(value, currency);
  const count = (value: number) => formatNumber(value, currency);
  const periodLabel = span(period.start, period.end);
  const comparisonLabel = span(period.previousStart, period.previousEnd);

  const alerts = buildAlerts({
    metrics,
    previousMetrics,
    campaigns,
    previousCampaigns,
    formatCurrency: money,
  });

  const tile = (key: MetricKey) => ({
    label: MEASURES[key].label,
    value: MEASURES[key].format(metrics[key], currency),
    previous: previousMetrics ? MEASURES[key].format(previousMetrics[key], currency) : "—",
    change: changes[key] ?? null,
    invert: MEASURES[key].invert,
  });

  const series = (rows: typeof trend, pick: (row: (typeof trend)[number]) => number) =>
    rows.map((row) => ({ label: shortDay(row.date), value: pick(row) }));

  const bySpend = [...campaigns].sort((a, b) => b.cost - a.cost);
  const topByConversions = [...campaigns]
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 5)
    .filter((campaign) => campaign.conversions > 0);

  return (
    <ReportDocument
      title={`${client.name} · Google Ads report · ${periodLabel}`}
      footer={`${client.name} · Prepared by ${client.agencyName} · Generated ${generatedAt()}`}
    >
      <ReportHeader
        eyebrow="Google Ads report"
        title={client.name}
        lines={[
          `Prepared by ${client.agencyName} · Google Ads account ${formatGoogleAdsCustomerId(client.customerId)}`,
          `${periodLabel} · compared with ${comparisonLabel}`,
        ]}
      />

      {report.isSample ? <Notice tone="caution">{SAMPLE_NOTICE}</Notice> : null}

      <Text style={{ fontSize: 11, marginTop: 14, lineHeight: 1.4 }}>{summarise(metrics, changes, report.currency)}</Text>

      {alerts.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          {alerts.map((alert) => (
            <Notice key={alert.id} tone={alert.tone}>
              <Text style={{ fontWeight: 600 }}>{alert.headline}</Text>
              <Text style={{ marginTop: 2 }}>{alert.detail}</Text>
            </Notice>
          ))}
        </View>
      ) : null}

      <Section title="Key figures" note={`Each figure against ${comparisonLabel}.`}>
        <TileGrid tiles={[tile("conversions"), tile("clicks"), ...TILE_METRICS.map(tile)]} />
      </Section>

      <Section title="Day by day">
        <View style={{ ...s.row, justifyContent: "space-between" }}>
          <LineChart
            title="Conversions"
            total={count(metrics.conversions)}
            points={series(trend, (row) => row.conversions)}
            comparison={series(previousTrend, (row) => row.conversions)}
            format={count}
          />
          <LineChart
            title="Clicks"
            total={count(metrics.clicks)}
            points={series(trend, (row) => row.clicks)}
            comparison={series(previousTrend, (row) => row.clicks)}
            format={count}
          />
        </View>
        <View style={{ marginTop: 10 }}>
          <LineChart
            title="Spend"
            total={money(metrics.cost)}
            points={series(trend, (row) => row.cost)}
            comparison={series(previousTrend, (row) => row.cost)}
            format={money}
            width={523}
            height={64}
          />
        </View>
      </Section>

      {campaigns.length > 0 ? (
        <Section title="Campaign highlights">
          <TileGrid
            tiles={highlightTiles(campaignHighlights(campaigns), report.currency).map((h) => ({
              label: h.label,
              value: h.value,
              caption: h.caption,
              text: h.key !== "all",
            }))}
          />
        </Section>
      ) : null}

      <Section title="Campaigns" note="Everything that ran in this period, by spend.">
        {campaigns.length === 0 ? (
          <Text style={s.muted}>No campaigns ran in this period.</Text>
        ) : (
          <Table
            columns={[
              { label: "Campaign", flex: 3.2 },
              { label: "Status", flex: 1.1 },
              { label: "Impr.", flex: 1.1, align: "right" },
              { label: "Clicks", flex: 0.9, align: "right" },
              { label: "CTR", flex: 0.9, align: "right" },
              { label: "Spend", flex: 1.2, align: "right" },
              { label: "Avg CPC", flex: 1, align: "right" },
              { label: "Conv.", flex: 0.8, align: "right" },
            ]}
            rows={bySpend.map((c) => [
              c.name,
              c.status.charAt(0) + c.status.slice(1).toLowerCase(),
              count(c.impressions),
              count(c.clicks),
              formatPercent(c.ctr),
              money(c.cost),
              money(c.averageCpc),
              count(c.conversions),
            ])}
          />
        )}
      </Section>

      {topByConversions.length > 0 ? (
        <Section title="Conversions by campaign" note="Top five in this period.">
          <BarList
            items={topByConversions.map((c) => ({ label: c.name, value: c.conversions, display: count(c.conversions) }))}
          />
        </Section>
      ) : null}

      <Section title="Daily breakdown">
        {trend.length === 0 ? (
          <Text style={s.muted}>No activity in this period.</Text>
        ) : (
          <Table
            columns={[
              { label: "Day", flex: 1.2 },
              { label: "Impressions", flex: 1.2, align: "right" },
              { label: "Clicks", flex: 1, align: "right" },
              { label: "CTR", flex: 1, align: "right" },
              { label: "Spend", flex: 1.2, align: "right" },
              { label: "Conversions", flex: 1.2, align: "right" },
              { label: "Cost / conv.", flex: 1.2, align: "right" },
            ]}
            rows={trend.map((day) => [
              shortDay(day.date),
              count(day.impressions),
              count(day.clicks),
              formatPercent(day.ctr),
              money(day.cost),
              count(day.conversions),
              day.conversions > 0 ? money(day.costPerConversion) : "—",
            ])}
          />
        )}
      </Section>

      <CallsSection calls={calls} count={count} />

      <AdsSection ads={ads} money={money} count={count} />

      <Text style={{ ...s.faint, fontSize: 7.5, marginTop: 18 }}>
        Figures come from Google Ads, compared with the previous period of the same length. Questions
        about this report go to {client.agencyName}.
      </Text>
    </ReportDocument>
  );
}

/** How many ads and keywords the PDF lists; the dashboard has the rest. */
const PDF_ROWS = 10;

/** Where an ad or keyword runs, under its name. */
function Named({ name, campaign, adGroup }: { name: string; campaign: string; adGroup: string }) {
  return (
    <View>
      <Text style={{ fontWeight: 600 }}>{name}</Text>
      <Text style={{ ...s.faint, fontSize: 7, marginTop: 1 }}>
        {campaign} › {adGroup}
      </Text>
    </View>
  );
}

function AdsSection({
  ads,
  money,
  count,
}: {
  ads: AdsReport | null;
  money: (value: number) => string;
  count: (value: number) => string;
}) {
  if (!ads) {
    return (
      <Section title="Ads">
        <Text style={s.muted}>Ad and keyword figures could not be loaded from Google Ads when this report was made.</Text>
      </Section>
    );
  }

  const perResult = (c: { conversions: number; costPerConversion: number }) =>
    c.conversions > 0 ? money(c.costPerConversion) : "—";

  return (
    <>
      <Section
        title="Ads"
        note={
          ads.ads.length > PDF_ROWS
            ? `The ${PDF_ROWS} with the most conversions, of ${count(ads.ads.length)} shown in this period.`
            : "Every ad shown in this period, most conversions first."
        }
      >
        {ads.ads.length === 0 ? (
          <Text style={s.muted}>No ads were shown in this period.</Text>
        ) : (
          <>
            <TileGrid
              tiles={adHighlightTiles(adHighlights(ads.ads), ads.currency).map((h, index) => ({
                label: h.label,
                value: h.value,
                caption: h.detail ? `${h.caption}
${h.detail}` : h.caption,
                text: index > 0,
              }))}
            />
            <View style={{ marginTop: 10 }}>
              <Table
                columns={[
                  { label: "Ad", flex: 4 },
                  { label: "Shown", flex: 1, align: "right" },
                  { label: "Clicks", flex: 0.9, align: "right" },
                  { label: "CTR", flex: 0.9, align: "right" },
                  { label: "Conv.", flex: 0.8, align: "right" },
                  { label: "Cost / conv.", flex: 1.1, align: "right" },
                  { label: "Spend", flex: 1.1, align: "right" },
                ]}
                rows={ads.ads.slice(0, PDF_ROWS).map((ad) => [
                  <Named key="ad" name={ad.headline} campaign={ad.campaign} adGroup={ad.adGroup} />,
                  count(ad.impressions),
                  count(ad.clicks),
                  formatPercent(ad.ctr),
                  count(ad.conversions),
                  perResult(ad),
                  money(ad.cost),
                ])}
              />
            </View>
          </>
        )}
      </Section>

      <Section title="Best performing keywords" note="Most conversions first, then clicks.">
        {ads.keywords.length === 0 ? (
          <Text style={s.muted}>No keyword traffic in this period.</Text>
        ) : (
          <Table
            columns={[
              { label: "Keyword", flex: 4 },
              { label: "Match", flex: 0.9 },
              { label: "Clicks", flex: 0.9, align: "right" },
              { label: "Conv.", flex: 0.8, align: "right" },
              { label: "Cost / conv.", flex: 1.1, align: "right" },
              { label: "Spend", flex: 1.1, align: "right" },
            ]}
            rows={ads.keywords.slice(0, PDF_ROWS).map((keyword) => [
              <Named key="kw" name={keyword.text} campaign={keyword.campaign} adGroup={keyword.adGroup} />,
              keyword.matchType || "—",
              count(keyword.clicks),
              count(keyword.conversions),
              perResult(keyword),
              money(keyword.cost),
            ])}
          />
        )}
      </Section>
    </>
  );
}

function CallsSection({
  calls,
  count,
}: {
  calls: CallReport | null;
  count: (value: number) => string;
}) {
  const title = "Calls";

  if (!calls) {
    return (
      <Section title={title}>
        <Text style={s.muted}>Call figures could not be loaded from Google Ads when this report was made.</Text>
      </Section>
    );
  }

  const { summary, previousSummary, changes, byDay, campaigns } = calls;

  if (summary.calls === 0 && previousSummary.calls === 0) {
    return (
      <Section title={title}>
        <Text style={s.muted}>
          No calls from your ads in this period. Calls are counted when someone phones the number shown in an ad,
          or on your website with Google&apos;s call reporting switched on.
        </Text>
      </Section>
    );
  }

  const answeredShare = summary.calls > 0 ? (summary.answered / summary.calls) * 100 : 0;

  return (
    <Section title={title} note="Calls placed from your ads, and whether someone answered.">
      <TileGrid
        tiles={[
          { label: "Calls", value: count(summary.calls), previous: count(previousSummary.calls), change: changes.calls },
          {
            label: "Answered",
            value: count(summary.answered),
            caption: `${Math.round(summary.answerRate)}% of calls`,
            change: changes.answered,
          },
          { label: "Missed", value: count(summary.missed), caption: "Nobody picked up", change: changes.missed, invert: true },
          {
            label: "Average call",
            value: minutes(summary.averageDuration),
            caption: "Minutes, over answered calls",
            change: changes.averageDuration,
            neutral: true,
          },
        ]}
      />

      <View style={{ marginTop: 10 }}>
        <LineChart
          title="Calls per day"
          total={`${count(summary.calls)} in total`}
          points={byDay.map((day) => ({ label: shortDay(day.date), value: day.calls }))}
          format={count}
          width={523}
          height={64}
        />
      </View>

      <View style={{ ...s.row, marginTop: 10 }} wrap={false}>
        <View style={{ ...s.card, flex: 1 }}>
          <Text style={{ fontWeight: 600, marginBottom: 8 }}>Top campaigns</Text>
          <BarList items={campaigns.map((c) => ({ label: c.name, value: c.calls, display: count(c.calls) }))} />
        </View>

        <View style={{ ...s.card, flex: 1, marginLeft: 10 }}>
          <Text style={{ fontWeight: 600, marginBottom: 8 }}>Answered vs missed</Text>
          <View style={{ ...s.row, height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: MISSED }}>
            <View style={{ width: `${answeredShare}%`, backgroundColor: C.brand }} />
          </View>
          <View style={{ ...s.row, justifyContent: "space-between", marginTop: 6 }}>
            <Text>
              <Text style={{ color: C.brand }}>■ </Text>Answered {count(summary.answered)}
            </Text>
            <Text>
              <Text style={{ color: MISSED }}>■ </Text>Missed {count(summary.missed)}
            </Text>
          </View>
          <Text style={{ ...s.muted, marginTop: 10 }}>
            {count(summary.fromAd)} dialled from the ad · {count(summary.fromWebsite)} from your website
          </Text>
        </View>
      </View>
    </Section>
  );
}
