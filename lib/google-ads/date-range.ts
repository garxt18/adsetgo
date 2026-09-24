/**
 * Date ranges for reports, resolved to explicit days.
 *
 * Google's `DURING LAST_7_DAYS` shorthand cannot express "the seven days before
 * those seven", and every delta chip needs exactly that. Resolving both windows
 * here keeps the current and prior periods the same length by construction, so
 * a comparison can never be drawn against a window of a different size.
 */

export type RangeKey =
  | "last_7_days"
  | "last_14_days"
  | "last_30_days"
  | "this_month"
  | "last_month";

export type ResolvedRange = {
  key: RangeKey;
  label: string;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
};

const LABELS: Record<RangeKey, string> = {
  last_7_days: "Last 7 days",
  last_14_days: "Last 14 days",
  last_30_days: "Last 30 days",
  this_month: "This month",
  last_month: "Last month",
};

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dayCount(start: string, end: string): number {
  const ms = Date.parse(end) - Date.parse(start);
  return Math.round(ms / 86_400_000) + 1;
}

export function isRangeKey(value: string): value is RangeKey {
  return value in LABELS;
}

/**
 * Ranges end yesterday: Google reports the current day only partially, and a
 * half-written day makes every comparison look like a collapse.
 */
export function resolveRange(input: string, now = new Date()): ResolvedRange {
  const key: RangeKey = isRangeKey(input) ? input : "last_7_days";
  const yesterday = addDays(now, -1);

  let start: string;
  let end: string;

  if (key === "this_month") {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    start = iso(first);
    end = iso(yesterday < first ? first : yesterday);
  } else if (key === "last_month") {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    start = iso(first);
    end = iso(last);
  } else {
    const days = key === "last_7_days" ? 7 : key === "last_14_days" ? 14 : 30;
    start = iso(addDays(yesterday, -(days - 1)));
    end = iso(yesterday);
  }

  const length = dayCount(start, end);
  const previousEnd = iso(addDays(new Date(start), -1));
  const previousStart = iso(addDays(new Date(start), -length));

  return { key, label: LABELS[key], start, end, previousStart, previousEnd };
}

/** Percentage change, or null when there is no prior figure to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}
