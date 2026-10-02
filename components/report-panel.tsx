"use client";

import { useState } from "react";

import { CallReportView } from "@/components/call-report";
import {
  ClientReport,
  type Campaign,
  type Changes,
  type Metrics,
  type ReportTab,
  type TrendRow,
} from "@/components/client-report";
import { Card, EmptyState, SampleBanner } from "@/components/ui/card";
import { span, type Period, type RangeValue } from "@/lib/google-ads/date-range";
import { useClientData, type Loaded } from "@/components/use-client-data";

/** One client's report, as /api/google-ads returns it. */
export type Report = {
  metrics: Metrics;
  previousMetrics: Metrics | null;
  changes: Changes;
  trend: TrendRow[];
  previousTrend: TrendRow[];
  campaigns: Campaign[];
  previousCampaigns: Campaign[];
  period: Period;
  isSample: boolean;
};

export type ReportState = {
  report: Report | null;
  status: Loaded<Report>["status"];
  message: string;
  clientId: string;
  range: RangeValue;
  selectRange: (next: RangeValue) => void;
};

/** The main report for the chosen period, plus the period control. */
export function useReport(
  clientId: string,
  messages: { notConfigured: string; failed: string }
): ReportState {
  const [range, setRange] = useState<RangeValue>("last_7_days");
  const { data, status, message } = useClientData<Report>("/api/google-ads", clientId, range, messages);

  return { report: data, status, message, clientId, range, selectRange: setRange };
}

/** The report itself, or why it is not there yet. */
export function ReportPanel({ state, tab }: { state: ReportState; tab: ReportTab }) {
  const { report, status, message } = state;

  const main =
    status === "loading" ? (
      <Card className="mt-4 p-10">
        <p className="text-sm text-ink-soft">Loading figures…</p>
      </Card>
    ) : status === "unavailable" ? (
      <Card className="mt-4">
        <EmptyState title="Figures are not available yet" description={message} />
      </Card>
    ) : report ? (
      <ClientReport
        metrics={report.metrics}
        previousMetrics={report.previousMetrics}
        changes={report.changes}
        trend={report.trend}
        previousTrend={report.previousTrend}
        campaigns={report.campaigns}
        previousCampaigns={report.previousCampaigns}
        periodLabel={span(report.period.start, report.period.end, false)}
        comparisonLabel={span(report.period.previousStart, report.period.previousEnd, false)}
        tab={tab}
      />
    ) : null;

  return (
    <>
      {report?.isSample && status !== "unavailable" ? <SampleBanner className="mt-4" /> : null}

      {/* Calls load only when their tab is opened: they cost their own Google
          queries. The main report stays mounted underneath, so its settings
          survive a look at the calls. */}
      {tab === "calls" ? <CallReportView clientId={state.clientId} range={state.range} /> : null}
      <div className={tab === "calls" ? "hidden" : undefined}>{main}</div>
    </>
  );
}
