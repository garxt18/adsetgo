"use client";

import { DeltaChip, Donut, LineChart, Sparkline, type Point } from "@/components/charts";
import { Card, CardHeader, EmptyState, StatTile } from "@/components/ui/card";
import { useClientData } from "@/components/use-client-data";
import { formatNumber } from "@/lib/format";
import type { CallReport } from "@/lib/google-ads/calls";
import { shortDay, type RangeValue } from "@/lib/google-ads/date-range";

/** 248 seconds reads as "4:08". */
function minutes(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="pt-2 text-xs font-medium uppercase tracking-[0.14em] text-ink-faint">
      {children}
    </h2>
  );
}

/**
 * The Calls tab: how many people phoned from the client's ads, whether anyone
 * picked up, and which campaigns brought them.
 *
 * Only calls Google can see are here -- calls to its forwarding numbers from
 * call assets, call-only ads and website numbers with call reporting on. The
 * empty state says so, since "no calls" usually means "no call tracking".
 */
export function CallReportView({ clientId, range }: { clientId: string; range: RangeValue }) {
  const { data, status, message } = useClientData<CallReport>("/api/google-ads/calls", clientId, range);

  if (status === "unavailable") {
    return (
      <Card className="mt-4">
        <EmptyState title="Calls are not available yet" description={message} />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="mt-4 p-10">
        <p className="text-sm text-ink-soft">Loading calls…</p>
      </Card>
    );
  }

  const { summary, previousSummary, changes, byDay, campaigns } = data;

  if (summary.calls === 0 && previousSummary.calls === 0) {
    return (
      <Card className="mt-4">
        <EmptyState
          title="No calls from your ads in this period"
          description="Calls are counted when someone phones the number shown in an ad, or on your website with Google's call reporting switched on. None came in during this period or the one before."
        />
      </Card>
    );
  }

  const perDay = (pick: (day: CallReport["byDay"][number]) => number): Point[] =>
    byDay.map((day) => ({ label: shortDay(day.date), value: pick(day) }));
  const busiest = Math.max(...campaigns.map((campaign) => campaign.calls), 1);

  return (
    // Dimmed, not blanked, while another period loads: the layout stays put.
    <div className={`mt-4 space-y-4 transition-opacity ${status === "loading" ? "opacity-60" : ""}`}>
      <SectionTitle>Call volume</SectionTitle>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Calls" value={formatNumber(summary.calls)}>
          <div className="mt-1.5">
            <DeltaChip change={changes.calls} />
          </div>
          <div className="mt-2">
            <Sparkline points={perDay((day) => day.calls)} height={26} />
          </div>
        </StatTile>
        <StatTile
          label="Answered"
          value={formatNumber(summary.answered)}
          caption={`${Math.round(summary.answerRate)}% of calls`}
        >
          <div className="mt-1.5">
            <DeltaChip change={changes.answered} />
          </div>
          <div className="mt-2">
            <Sparkline points={perDay((day) => day.answered)} height={26} />
          </div>
        </StatTile>
        <StatTile label="Missed" value={formatNumber(summary.missed)} caption="Nobody picked up">
          <div className="mt-1.5">
            {/* Fewer missed calls is the good direction. */}
            <DeltaChip change={changes.missed} invert />
          </div>
          <div className="mt-2">
            <Sparkline points={perDay((day) => day.calls - day.answered)} height={26} />
          </div>
        </StatTile>
        <StatTile
          label="Average call"
          value={minutes(summary.averageDuration)}
          caption="Minutes, over answered calls"
        >
          <div className="mt-1.5">
            <DeltaChip change={changes.averageDuration} neutral />
          </div>
        </StatTile>
      </div>

      <Card className="animate-rise p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-base font-medium tracking-[-0.01em] text-ink">Calls per day</h3>
          <span className="tabular text-sm text-ink-soft">{formatNumber(summary.calls)} in total</span>
        </div>
        <LineChart points={perDay((day) => day.calls)} area format={(value) => formatNumber(value)} />
      </Card>

      <SectionTitle>Where calls came from</SectionTitle>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="animate-rise">
          <CardHeader title="Top campaigns" description="Calls each campaign brought in" />
          <ul className="space-y-4 px-5 py-4">
            {campaigns.map((campaign) => (
              <li key={campaign.name}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-ink">{campaign.name}</span>
                  <span className="tabular font-medium text-ink">{formatNumber(campaign.calls)}</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-surface-sunken">
                  <div
                    className="h-2 rounded-full bg-brand transition-[width] duration-500"
                    style={{ width: `${(campaign.calls / busiest) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="animate-rise">
          <CardHeader title="Answered vs missed" description={`${formatNumber(summary.calls)} calls`} />
          <div className="flex flex-wrap items-center justify-center gap-8 px-5 py-6">
            <Donut
              parts={[
                { label: "Answered", value: summary.answered },
                { label: "Missed", value: summary.missed },
              ]}
            >
              <span className="tabular text-2xl font-medium tracking-[-0.02em] text-ink">
                {Math.round(summary.answerRate)}%
              </span>
              <span className="text-xs text-ink-soft">answered</span>
            </Donut>

            <dl className="space-y-3 text-sm">
              <div className="flex items-center gap-2.5">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-brand" />
                <dt className="text-ink-soft">Answered</dt>
                <dd className="tabular ml-auto pl-6 font-medium text-ink">
                  {formatNumber(summary.answered)}
                </dd>
              </div>
              <div className="flex items-center gap-2.5">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-brand/20" />
                <dt className="text-ink-soft">Missed</dt>
                <dd className="tabular ml-auto pl-6 font-medium text-ink">
                  {formatNumber(summary.missed)}
                </dd>
              </div>
              <div className="border-t border-line pt-3 text-xs text-ink-soft">
                {formatNumber(summary.fromAd)} dialled from the ad ·{" "}
                {formatNumber(summary.fromWebsite)} from your website
              </div>
            </dl>
          </div>
        </Card>
      </div>
    </div>
  );
}
