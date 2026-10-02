/**
 * The client's report as a PDF: everything on their dashboard -- the summary,
 * alerts, all eight figures with their changes, the daily trends, campaigns
 * and calls -- plus a day-by-day table, since paper has no hover to read
 * exact values from a chart.
 */

import { Text, View } from "@react-pdf/renderer";

import type { CallReport } from "../google-ads/calls.ts";
import { formatGoogleAdsCustomerId } from "../google-ads/format.ts";
import { shortDay, span } from "../google-ads/date-range.ts";
import type { buildReport } from "../google-ads/report.ts";
import { formatCurrency, formatNumber, formatPercent } from "../format.ts";
import { buildAlerts } from "../insights.ts";
import { MEASURES, TILE_METRICS, summarise, type MetricKey } from "../report-copy.ts";
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
}: {
  client: { name: string; agencyName: string; customerId: string };
  report: Report;
  /** Null when Google could not be asked for calls; the rest still prints. */
  calls: CallReport | null;
}) {
  const { metrics, previousMetrics, changes, trend, previousTrend, campaigns, previousCampaigns, period } = report;
  const periodLabel = span(period.start, period.end);
  const comparisonLabel = span(period.previousStart, period.previousEnd);

  const alerts = buildAlerts({
    metrics,
    previousMetrics,
    campaigns,
    previousCampaigns,
    formatCurrency: (value) => formatCurrency(value),
  });

  const tile = (key: MetricKey) => ({
    label: MEASURES[key].label,
    value: MEASURES[key].format(metrics[key]),
    previous: previousMetrics ? MEASURES[key].format(previousMetrics[key]) : "—",
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

      <Text style={{ fontSize: 11, marginTop: 14, lineHeight: 1.4 }}>{summarise(metrics, changes)}</Text>

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
            total={formatNumber(metrics.conversions)}
            points={series(trend, (row) => row.conversions)}
            comparison={series(previousTrend, (row) => row.conversions)}
            format={formatNumber}
          />
          <LineChart
            title="Clicks"
            total={formatNumber(metrics.clicks)}
            points={series(trend, (row) => row.clicks)}
            comparison={series(previousTrend, (row) => row.clicks)}
            format={formatNumber}
          />
        </View>
        <View style={{ marginTop: 10 }}>
          <LineChart
            title="Spend"
            total={formatCurrency(metrics.cost)}
            points={series(trend, (row) => row.cost)}
            comparison={series(previousTrend, (row) => row.cost)}
            format={(value) => formatCurrency(value)}
            width={523}
            height={64}
          />
        </View>
      </Section>

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
              formatNumber(c.impressions),
              formatNumber(c.clicks),
              formatPercent(c.ctr),
              formatCurrency(c.cost),
              formatCurrency(c.averageCpc),
              formatNumber(c.conversions),
            ])}
          />
        )}
      </Section>

      {topByConversions.length > 0 ? (
        <Section title="Conversions by campaign" note="Top five in this period.">
          <BarList
            items={topByConversions.map((c) => ({ label: c.name, value: c.conversions, display: formatNumber(c.conversions) }))}
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
              formatNumber(day.impressions),
              formatNumber(day.clicks),
              formatPercent(day.ctr),
              formatCurrency(day.cost),
              formatNumber(day.conversions),
              day.conversions > 0 ? formatCurrency(day.costPerConversion) : "—",
            ])}
          />
        )}
      </Section>

      <CallsSection calls={calls} />

      <Text style={{ ...s.faint, fontSize: 7.5, marginTop: 18 }}>
        Figures come from Google Ads, compared with the previous period of the same length. Questions
        about this report go to {client.agencyName}.
      </Text>
    </ReportDocument>
  );
}

function CallsSection({ calls }: { calls: CallReport | null }) {
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
          { label: "Calls", value: formatNumber(summary.calls), previous: formatNumber(previousSummary.calls), change: changes.calls },
          {
            label: "Answered",
            value: formatNumber(summary.answered),
            caption: `${Math.round(summary.answerRate)}% of calls`,
            change: changes.answered,
          },
          { label: "Missed", value: formatNumber(summary.missed), caption: "Nobody picked up", change: changes.missed, invert: true },
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
          total={`${formatNumber(summary.calls)} in total`}
          points={byDay.map((day) => ({ label: shortDay(day.date), value: day.calls }))}
          format={formatNumber}
          width={523}
          height={64}
        />
      </View>

      <View style={{ ...s.row, marginTop: 10 }} wrap={false}>
        <View style={{ ...s.card, flex: 1 }}>
          <Text style={{ fontWeight: 600, marginBottom: 8 }}>Top campaigns</Text>
          <BarList items={campaigns.map((c) => ({ label: c.name, value: c.calls, display: formatNumber(c.calls) }))} />
        </View>

        <View style={{ ...s.card, flex: 1, marginLeft: 10 }}>
          <Text style={{ fontWeight: 600, marginBottom: 8 }}>Answered vs missed</Text>
          <View style={{ ...s.row, height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: MISSED }}>
            <View style={{ width: `${answeredShare}%`, backgroundColor: C.brand }} />
          </View>
          <View style={{ ...s.row, justifyContent: "space-between", marginTop: 6 }}>
            <Text>
              <Text style={{ color: C.brand }}>■ </Text>Answered {formatNumber(summary.answered)}
            </Text>
            <Text>
              <Text style={{ color: MISSED }}>■ </Text>Missed {formatNumber(summary.missed)}
            </Text>
          </View>
          <Text style={{ ...s.muted, marginTop: 10 }}>
            {formatNumber(summary.fromAd)} dialled from the ad · {formatNumber(summary.fromWebsite)} from your website
          </Text>
        </View>
      </View>
    </Section>
  );
}
