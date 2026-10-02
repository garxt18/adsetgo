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

/**
 * What a report request names: a preset, or a custom range written
 * "2026-09-01..2026-09-15" (inclusive). One string, so every report route
 * passes it on unchanged in its `dateRange` parameter.
 */
export type RangeValue = RangeKey | `${string}..${string}`;

export type ResolvedRange = {
  key: RangeKey | "custom";
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

/** Every calendar day from start to end inclusive, as YYYY-MM-DD. */
export function eachDay(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  while (cursor <= end && days.length < 400) {
    days.push(iso(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

function dayCount(start: string, end: string): number {
  const ms = Date.parse(end) - Date.parse(start);
  return Math.round(ms / 86_400_000) + 1;
}

export function isRangeKey(value: string): value is RangeKey {
  return value in LABELS;
}

/** Long enough for a year-on-year look; the previous window doubles the query. */
export const MAX_CUSTOM_DAYS = 366;

const CUSTOM = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;

/**
 * The last day a report may include: yesterday, by the server's (UTC) clock.
 * The date pickers use this too, so they never offer a day the server would
 * refuse.
 */
export function latestReportDay(now = new Date()): string {
  return iso(addDays(now, -1));
}

export function customRange(start: string, end: string): RangeValue {
  return `${start}..${end}`;
}

/**
 * The days a custom range covers, or why it cannot be used. The pickers show
 * the reason; the server treats any reason as "not a range" (see resolveRange).
 */
export function checkCustomRange(
  start: string,
  end: string,
  now = new Date()
): { ok: true } | { ok: false; reason: string } {
  const real = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && iso(new Date(`${day}T00:00:00Z`)) === day;

  if (!real(start) || !real(end)) return { ok: false, reason: "Choose both a start and an end date." };
  if (start > end) return { ok: false, reason: "The start date must come before the end date." };
  if (end > latestReportDay(now)) {
    return { ok: false, reason: "The range can end yesterday at the latest: Google reports today only partly." };
  }
  if (dayCount(start, end) > MAX_CUSTOM_DAYS) {
    return { ok: false, reason: `A range can cover at most ${MAX_CUSTOM_DAYS} days.` };
  }
  return { ok: true };
}

/**
 * Ranges end yesterday: Google reports the current day only partially, and a
 * half-written day makes every comparison look like a collapse.
 */
export function resolveRange(input: string, now = new Date()): ResolvedRange {
  const custom = input.match(CUSTOM);

  // A custom range the pickers would have refused is treated like any other
  // unrecognised value: the default week, whose dates the page then shows.
  if (custom && checkCustomRange(custom[1], custom[2], now).ok) {
    return withPrevious("custom", "Custom range", custom[1], custom[2]);
  }

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

  return withPrevious(key, LABELS[key], start, end);
}

/** A range plus the window of the same length just before it, for comparison. */
function withPrevious(key: ResolvedRange["key"], label: string, start: string, end: string): ResolvedRange {
  const length = dayCount(start, end);
  const previousEnd = iso(addDays(new Date(start), -1));
  const previousStart = iso(addDays(new Date(start), -length));

  return { key, label, start, end, previousStart, previousEnd };
}

/** Percentage change, or null when there is no prior figure to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

/** The two windows a report covers, as the report API returns them. */
export type Period = Omit<ResolvedRange, "key">;

export function periodOf({ label, start, end, previousStart, previousEnd }: ResolvedRange): Period {
  return { label, start, end, previousStart, previousEnd };
}

/** The period buttons every report screen offers, shortest first. */
export const RANGE_OPTIONS: Array<{ value: RangeKey; label: string; short: string }> = [
  { value: "last_7_days", label: "7 days", short: "7D" },
  { value: "last_14_days", label: "14 days", short: "14D" },
  { value: "last_30_days", label: "30 days", short: "30D" },
  { value: "this_month", label: "This month", short: "MTD" },
  { value: "last_month", label: "Last month", short: "LM" },
];

// Report dates are calendar days ("2026-09-17"), which JavaScript reads as
// midnight UTC. Formatted in the viewer's own time zone they showed the day
// before for anyone west of Greenwich, so they are always formatted in UTC.
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const DAY_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "18 Sept", for chart axes. Anything unreadable is shown as given. */
export function shortDay(date: string): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : DAY.format(parsed);
}

/** "17 Sept – 23 Sept 2026", or without the year where space is short. */
export function span(start: string, end: string, withYear = true): string {
  const to = new Date(end);
  // A one-day custom range reads as that day, not "10 Sept – 10 Sept".
  if (start === end) return withYear && !Number.isNaN(to.getTime()) ? DAY_YEAR.format(to) : shortDay(end);
  return `${shortDay(start)} – ${withYear && !Number.isNaN(to.getTime()) ? DAY_YEAR.format(to) : shortDay(end)}`;
}
