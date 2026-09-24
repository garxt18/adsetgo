"use client";

import { DeltaChip, LineChart, type Point } from "@/components/charts";

export type MetricDetailData = {
  label: string;
  value: string;
  previousValue: string;
  change: number | null;
  /** True where a fall is the good outcome, such as cost per result. */
  invert?: boolean;
  points: Point[];
  comparisonPoints?: Point[];
  periodLabel?: string;
  comparisonLabel?: string;
  format: (value: number) => string;
  /** One line saying what this measure actually means, in the client's terms. */
  meaning: string;
};

/**
 * What one figure is doing, for a reader who clicked it to ask.
 *
 * Read order is deliberate: the shape over time first, then the plain-language
 * reading of it, then the arithmetic anyone might want to check. A client
 * wants the answer before the evidence.
 */
export function MetricDetail({ detail }: { detail: MetricDetailData }) {
  const values = detail.points.map((p) => p.value);
  const hasSeries = values.length > 1;

  const high = hasSeries ? Math.max(...values) : 0;
  const low = hasSeries ? Math.min(...values) : 0;
  const average = hasSeries ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

  const highestDay = hasSeries ? detail.points[values.indexOf(high)] : null;
  const lowestDay = hasSeries ? detail.points[values.indexOf(low)] : null;

  // Comparing the two halves of the window says which way the period ended,
  // which a single start-to-end comparison hides when the middle swings.
  const half = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, half);
  const secondHalf = values.slice(half);
  const mean = (list: number[]) =>
    list.length ? list.reduce((sum, v) => sum + v, 0) / list.length : 0;
  const drift = mean(secondHalf) - mean(firstHalf);
  const driftShare = mean(firstHalf) !== 0 ? (drift / Math.abs(mean(firstHalf))) * 100 : 0;

  const direction =
    Math.abs(driftShare) < 2 ? "held steady" : driftShare > 0 ? "climbed" : "eased off";

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="tabular text-3xl font-medium tracking-[-0.02em] text-ink">
          {detail.value}
        </span>
        <DeltaChip change={detail.change} invert={detail.invert} />
        <span className="text-sm text-ink-soft">
          was {detail.previousValue} in the period before
        </span>
      </div>

      <p className="mt-2 text-sm text-ink-soft">{detail.meaning}</p>

      <div className="mt-5 rounded-xl bg-surface-sunken p-4">
        <LineChart
          points={detail.points}
          comparison={detail.comparisonPoints}
          seriesLabel={detail.periodLabel}
          comparisonLabel={detail.comparisonLabel}
          height={200}
          area
          format={detail.format}
        />
      </div>

      {hasSeries ? (
        <>
          <p className="mt-5 text-sm text-ink">
            Across the second half of the period it{" "}
            <strong className="font-medium">{direction}</strong>
            {Math.abs(driftShare) >= 2
              ? ` by about ${Math.abs(Math.round(driftShare))}% against the first half.`
              : "."}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line ring-1 ring-line sm:grid-cols-3">
            <Figure label="Daily average" value={detail.format(average)} />
            {/* Neutral labels: the highest spend is not the "best" day, and
                calling it that would praise a day that cost the most. */}
            <Figure label="Highest day" value={detail.format(high)} caption={highestDay?.label} />
            <Figure label="Lowest day" value={detail.format(low)} caption={lowestDay?.label} />
          </dl>
        </>
      ) : (
        <p className="mt-5 text-sm text-ink-soft">
          A single day cannot show a trend. Choose a longer period to see how this
          figure moves.
        </p>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </dt>
      <dd className="tabular mt-1 text-lg font-medium text-ink">{value}</dd>
      {caption ? <p className="text-xs text-ink-faint">{caption}</p> : null}
    </div>
  );
}
