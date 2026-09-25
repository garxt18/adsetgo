"use client";

import { useEffect, useState } from "react";

import {
  ClientReport,
  type Campaign,
  type Changes,
  type Metrics,
  type TrendRow,
} from "@/components/client-report";
import { Card, EmptyState, SampleBanner } from "@/components/ui/card";
import { span, type Period, type RangeKey } from "@/lib/google-ads/date-range";

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
  range: RangeKey;
  selectRange: (next: RangeKey) => void;
  report: Report | null;
  status: "loading" | "ready" | "unavailable";
  message: string;
};

/**
 * Loads one client's report for the chosen period.
 *
 * The client's own portal and the agency's view of a client show the same
 * report, and each used to carry its own copy of this loading code -- ten
 * pieces of state and the fetch -- so they lived here once instead.
 */
export function useReport(
  clientId: string,
  messages: { notConfigured: string; failed: string }
): ReportState {
  const [range, setRange] = useState<RangeKey>("last_7_days");
  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState<ReportState["status"]>("loading");
  const [message, setMessage] = useState("");
  const { notConfigured, failed } = messages;

  useEffect(() => {
    // Guards against a slower earlier request landing after a faster later one
    // and overwriting the period the reader actually chose.
    let cancelled = false;

    async function load() {
      try {
        const query = new URLSearchParams({ clientId, dateRange: range });
        const res = await fetch(`/api/google-ads?${query.toString()}`);
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok || data.status === "error" || data.status === "not_configured") {
          setMessage(data.status === "not_configured" ? notConfigured : failed);
          setStatus("unavailable");
          return;
        }

        setReport(data as Report);
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setMessage("The report could not be loaded. Try again in a moment.");
        setStatus("unavailable");
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [clientId, range, notConfigured, failed]);

  return {
    range,
    selectRange(next) {
      setStatus("loading");
      setRange(next);
    },
    report,
    status,
    message,
  };
}

/** The report itself, or why it is not there yet. */
export function ReportPanel({
  state,
  tab,
}: {
  state: ReportState;
  tab: "overview" | "campaigns";
}) {
  const { report, status, message } = state;

  return (
    <>
      {report?.isSample && status !== "unavailable" ? <SampleBanner className="mt-4" /> : null}

      {status === "loading" ? (
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
      ) : null}
    </>
  );
}
