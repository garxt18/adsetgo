/**
 * Turns Google Ads call rows into the figures the Calls tab shows.
 *
 * Pure, like report.ts: live and sample calls go through the same arithmetic,
 * and it is tested directly.
 */

import type { CallActionRow, CallRow, ConversionRow } from "./auth.ts";
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

const round2 = (value: number) => Number(value.toFixed(2));

/** Google's default for the shortest call a call conversion action counts. */
const DEFAULT_CALL_SECONDS = 60;

/** The account's phone-call conversion actions, read from conversion_action. */
export function callActions(rows: CallActionRow[]) {
  return rows.flatMap((row) => {
    const action = row.conversionAction;
    if (!action?.resourceName) return [];

    const seconds = Number(action.phoneCallDurationSeconds ?? DEFAULT_CALL_SECONDS);
    return [
      {
        id: action.resourceName,
        name: action.name ?? "Call conversion action",
        /** Which of call_view's calls it can count: dialled from the ad, or from the website. */
        source: action.type === "WEBSITE_CALL" ? ("website" as const) : ("ad" as const),
        enabled: action.status === "ENABLED",
        minimumSeconds: Number.isFinite(seconds) ? seconds : DEFAULT_CALL_SECONDS,
        oncePerClick: action.countingType === "ONE_PER_CLICK",
        /** False for a secondary action: recorded under All conversions, never Conversions. */
        primary: action.primaryForGoal !== false,
      },
    ];
  });
}

export type CallAction = ReturnType<typeof callActions>[number];

/** 60 reads as "1 minute", 90 as "90 seconds". */
function callLength(seconds: number): string {
  if (seconds % 60 !== 0) return `${seconds} seconds`;
  const minutes = seconds / 60;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** An action's counting rules in a line: "Calls of 1 minute or longer, once per ad click". */
export function callRule({ minimumSeconds, oncePerClick }: Pick<CallAction, "minimumSeconds" | "oncePerClick">) {
  const length = minimumSeconds > 0 ? `Calls of ${callLength(minimumSeconds)} or longer` : "Calls of any length";
  return `${length}, ${oncePerClick ? "once per ad click" : "every call"}`;
}

/**
 * How many of the period's calls counted as conversions, and the rules each
 * call action counts them by.
 *
 * The two figures disagree by design: call_view lists every call Google
 * tracked, while an action counts only answered calls at least its minimum
 * length -- once per ad click if it is set to "One" -- and dates each by the
 * ad click rather than the call. Calls long enough is worked out from
 * call_view, so the reader can see which of those rules made the difference.
 */
export function callConversions(calls: CallRow[], conversionRows: ConversionRow[], actionRows: CallActionRow[]) {
  const tallies = new Map<string, { conversions: number; allConversions: number }>();
  for (const row of conversionRows) {
    const id = row.segments?.conversionAction;
    if (!id) continue;
    const tally = tallies.get(id) ?? { conversions: 0, allConversions: 0 };
    tally.conversions += Number(row.metrics?.conversions ?? 0);
    tally.allConversions += Number(row.metrics?.allConversions ?? 0);
    tallies.set(id, tally);
  }

  const sourceOf = (call: CallRow) =>
    call.callView?.callTrackingDisplayLocation === "LANDING_PAGE" ? "website" : "ad";

  const actions = callActions(actionRows)
    .map((action) => {
      const tally = tallies.get(action.id) ?? { conversions: 0, allConversions: 0 };
      const fromSource = calls.filter((call) => sourceOf(call) === action.source);
      return {
        ...action,
        rule: callRule(action),
        /** Calls of the kind this action can count, whatever their length. */
        calls: fromSource.length,
        /** Of those, answered and at least the action's minimum length. */
        longEnough: fromSource.filter(
          (call) =>
            call.callView?.callStatus === "RECEIVED" &&
            Number(call.callView.callDurationSeconds ?? 0) >= action.minimumSeconds
        ).length,
        conversions: round2(tally.conversions),
        allConversions: round2(tally.allConversions),
      };
    })
    // A removed or paused action is only worth a line if it still counted something.
    .filter((action) => action.enabled || action.allConversions > 0)
    .sort((a, b) => b.conversions - a.conversions || b.calls - a.calls);

  return {
    counted: round2(actions.reduce((sum, action) => sum + action.conversions, 0)),
    actions,
  };
}

export type CallConversions = ReturnType<typeof callConversions>;

/** The Calls tab: both windows, their comparison, and the breakdowns. */
export function buildCallReport({
  range,
  rows,
  previousRows,
  isSample,
  conversions = null,
}: {
  range: ResolvedRange;
  rows: CallRow[];
  previousRows: CallRow[];
  isSample: boolean;
  /**
   * The period's conversion rows and the account's call actions, to say how
   * many calls counted as conversions. Null when they could not be had: the
   * call figures stand on their own.
   */
  conversions?: { rows: ConversionRow[]; actions: CallActionRow[] } | null;
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
    conversions: conversions ? callConversions(rows, conversions.rows, conversions.actions) : null,
    isSample,
  };
}

export type CallReport = ReturnType<typeof buildCallReport>;
