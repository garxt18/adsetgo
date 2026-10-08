/**
 * The agency's overview as a PDF: the same headline figures and client list
 * as the agency dashboard, for the chosen period.
 */

import { Text, View } from "@react-pdf/renderer";

import type { AgencyOverview } from "../agency-overview.ts";
import { formatAmounts, formatCurrency, formatNumber } from "../format.ts";
import { formatGoogleAdsCustomerId } from "../google-ads/format.ts";
import { span } from "../google-ads/date-range.ts";
import {
  C,
  Change,
  Notice,
  ReportDocument,
  ReportHeader,
  SAMPLE_NOTICE,
  Section,
  Sparkline,
  Table,
  TileGrid,
  generatedAt,
  s,
} from "./kit.tsx";

const CONNECTION: Record<string, string> = {
  connected: "Connected",
  expired: "Needs reconnecting",
  error: "Needs attention",
};

export function AgencyReportPdf({ overview }: { overview: AgencyOverview }) {
  const { agency, period, clients, totals } = overview;
  const periodLabel = span(period.start, period.end);
  const comparisonLabel = span(period.previousStart, period.previousEnd);
  const active = clients.filter((client) => client.status === "active").length;

  // Highest spend first, as the dashboard sorts by default; clients without
  // figures (no account linked, or Google unavailable) go last.
  const ranked = [...clients].sort((a, b) => (b.metrics?.cost ?? -1) - (a.metrics?.cost ?? -1));

  return (
    <ReportDocument
      title={`${agency.name} · Agency report · ${periodLabel}`}
      footer={`${agency.name} · Agency report · Generated ${generatedAt()}`}
    >
      <ReportHeader
        eyebrow="Agency report"
        title={agency.name}
        lines={[
          `Google Ads manager account ${
            agency.managerCustomerId ? formatGoogleAdsCustomerId(agency.managerCustomerId) : "not recorded"
          } · ${CONNECTION[agency.connectionStatus ?? ""] ?? "Not connected"}`,
          `${periodLabel} · compared with ${comparisonLabel}`,
        ]}
      />

      {overview.isSample ? <Notice tone="caution">{SAMPLE_NOTICE}</Notice> : null}
      {overview.connectionError ? (
        <Notice tone="caution">Google Ads needs reconnecting, so client figures are missing from this report.</Notice>
      ) : null}

      <Section title="Summary" note="All clients together.">
        <TileGrid
          columns={3}
          tiles={[
            { label: "Clients", value: formatNumber(clients.length), caption: `${active} active` },
            // Per currency: pounds and rupees are listed side by side, never added.
            { label: "Ad spend", value: formatAmounts(totals.spend.map((t) => ({ value: t.cost, currency: t.currency }))) },
            { label: "Conversions", value: formatNumber(totals.conversions) },
            {
              label: "Cost per conversion",
              value: formatAmounts(
                totals.spend
                  .filter((t) => t.conversions > 0)
                  .map((t) => ({ value: t.costPerConversion, currency: t.currency }))
              ),
            },
            { label: "Clicks", value: formatNumber(totals.clicks) },
            { label: "Impressions", value: formatNumber(totals.impressions) },
          ]}
        />
      </Section>

      <Section
        title="Clients"
        note={`Highest spend first. Changes compare with ${comparisonLabel}; spend changes carry no colour, since spending more is neither good nor bad.`}
      >
        {clients.length === 0 ? (
          <Text style={s.muted}>No clients yet.</Text>
        ) : (
          <Table
            columns={[
              { label: "Client", flex: 2.6 },
              { label: "Status", flex: 1 },
              { label: "Spend", flex: 1.3, align: "right" },
              { label: "Change", flex: 1.2, align: "right" },
              { label: "Conv.", flex: 0.9, align: "right" },
              { label: "Change", flex: 1.2, align: "right" },
              { label: "Clicks", flex: 0.9, align: "right" },
              { label: "Cost / conv.", flex: 1.2, align: "right" },
              { label: "Spend trend", flex: 1.3, align: "right" },
            ]}
            rows={ranked.map((client) => [
              <View key="name">
                <Text style={{ fontWeight: 600 }}>{client.name}</Text>
                <Text style={{ ...s.faint, fontSize: 7, marginTop: 1 }}>
                  {client.googleAdsCustomerId ? formatGoogleAdsCustomerId(client.googleAdsCustomerId) : "No account linked"}
                </Text>
              </View>,
              <Text key="status" style={{ color: client.status === "active" ? C.positive : C.inkSoft }}>
                {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
              </Text>,
              client.metrics ? formatCurrency(client.metrics.cost, client.currency ?? undefined) : "—",
              client.metrics ? <Change key="spend" change={client.change} neutral /> : "—",
              client.metrics ? formatNumber(client.metrics.conversions, client.currency ?? undefined) : "—",
              client.metrics ? <Change key="conv" change={client.conversionChange} /> : "—",
              client.metrics ? formatNumber(client.metrics.clicks, client.currency ?? undefined) : "—",
              client.metrics && client.metrics.conversions > 0
                ? formatCurrency(client.metrics.costPerConversion, client.currency ?? undefined)
                : "—",
              <Sparkline key="trend" points={client.spendSeries.map((point) => point.value)} />,
            ])}
          />
        )}
      </Section>

      <Text style={{ ...s.faint, fontSize: 7.5, marginTop: 18 }}>
        Figures come from Google Ads, compared with the previous period of the same length.
      </Text>
    </ReportDocument>
  );
}
