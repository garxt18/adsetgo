/**
 * Turns Google Ads call rows into the figures the Calls tab shows.
 *
 * Pure, like report.ts: live and sample calls go through the same arithmetic,
 * and it is tested directly.
 */

import type { CallRow } from "./auth.ts";
import { eachDay, percentChange, periodOf, type ResolvedRange } from "./date-range.ts";

/** Headline call figures for one window. */
export function summarizeCalls(rows: CallRow[]) {
  let answered = 0;
  let missed = 0;
  let talkSeconds = 0;
  let fromWebsite = 0;

  for (const row of rows) {
    const call = row.callView;

    if (call?.callStatus === "MISSED") {
      missed += 1;
    } else if (call?.callStatus === "RECEIVED") {
      answered += 1;
      talkSeconds += Number(call.callDurationSeconds ?? 0);
    }

    if (call?.callTrackingDisplayLocation === "LANDING_PAGE") fromWebsite += 1;
  }

  const calls = rows.length;

  return {
    calls,
    answered,
    missed,
    /** Of all calls, the share someone picked up, as a percentage. */
    answerRate: calls > 0 ? Number(((answered / calls) * 100).toFixed(1)) : 0,
    /** Seconds, over answered calls only: a missed call has no length. */
    averageDuration: answered > 0 ? Math.round(talkSeconds / answered) : 0,
    fromAd: calls - fromWebsite,
    fromWebsite,
  };
}

export type CallSummary = ReturnType<typeof summarizeCalls>;

/** One point per day of the window, including days without a call. */
export function callsByDay(rows: CallRow[], start: string, end: string) {
  const days = new Map(eachDay(start, end).map((date) => [date, { date, calls: 0, answered: 0 }]));

  for (const row of rows) {
    const day = days.get(row.callView?.startCallDateTime?.slice(0, 10) ?? "");
    if (!day) continue;
    day.calls += 1;
    if (row.callView?.callStatus === "RECEIVED") day.answered += 1;
  }

  return Array.from(days.values());
}

/** Calls per campaign, busiest first. */
export function callsByCampaign(rows: CallRow[]) {
  const campaigns = new Map<string, { name: string; calls: number; answered: number }>();

  for (const row of rows) {
    const id = String(row.campaign?.id ?? "unknown");
    const entry = campaigns.get(id) ?? { name: row.campaign?.name ?? "Campaign", calls: 0, answered: 0 };
    entry.calls += 1;
    if (row.callView?.callStatus === "RECEIVED") entry.answered += 1;
    campaigns.set(id, entry);
  }

  return Array.from(campaigns.values()).sort((a, b) => b.calls - a.calls);
}

/** The Calls tab: both windows, their comparison, and the breakdowns. */
export function buildCallReport({
  range,
  rows,
  previousRows,
  isSample,
}: {
  range: ResolvedRange;
  rows: CallRow[];
  previousRows: CallRow[];
  isSample: boolean;
}) {
  const summary = summarizeCalls(rows);
  const previousSummary = summarizeCalls(previousRows);
  const compared = ["calls", "answered", "missed", "answerRate", "averageDuration"] as const;

  return {
    status: "connected" as const,
    period: periodOf(range),
    summary,
    previousSummary,
    changes: Object.fromEntries(
      compared.map((key) => [key, percentChange(summary[key], previousSummary[key])])
    ) as Record<(typeof compared)[number], number | null>,
    byDay: callsByDay(rows, range.start, range.end),
    campaigns: callsByCampaign(rows),
    isSample,
  };
}

export type CallReport = ReturnType<typeof buildCallReport>;
