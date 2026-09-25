"use client";

import { useState, type ReactNode } from "react";

/**
 * Charts for this product, drawn as plain SVG.
 *
 * Every chart here shows one series, so none carries a legend: the card title
 * names the measure. Marks use the brand hue only -- these plots answer "how
 * much" and "which way", not "which of several things", so a categorical
 * palette would invent an identity the data does not have. Status colours stay
 * reserved for state (delta chips, pills) and are never used as a series.
 */

export type Point = { label: string; value: number };

const PAD = { top: 10, right: 6, bottom: 20, left: 6 };

/**
 * `domain` supplies the values the vertical scale must cover, which is both
 * periods when a comparison is drawn. The horizontal scale always follows
 * `points`, since the comparison is stretched across the same span rather than
 * appended to it.
 */
function scale(points: Point[], width: number, height: number, domain?: Point[]) {
  const values = (domain ?? points).map((p) => p.value);
  const high = Math.max(...values);
  const low = Math.min(...values);

  // A line answers "which way is this going", so it is scaled to the data with
  // a little headroom rather than pinned to zero. Forcing a zero baseline
  // flattens a week of real movement into a straight line near the top, which
  // reads as "nothing happened". Bars, which answer "how much", keep zero.
  const padding = (high - low || Math.abs(high) || 1) * 0.15;
  const max = high + padding;
  const min = Math.max(0, low - padding);
  const span = max - min || 1;

  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const x = (i: number) =>
    PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - min) / span) * innerH;

  return { x, y, max, min, high, low, innerH };
}

function NoData({ height, label }: { height: number; label: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl bg-surface-sunken text-xs text-ink-faint"
      style={{ height }}
    >
      {label}
    </div>
  );
}

/**
 * Trend line with a crosshair. `area` fills beneath the line for the single
 * headline chart on a page; plain lines elsewhere so several charts side by
 * side do not compete.
 */
export function LineChart({
  points,
  comparison,
  seriesLabel,
  comparisonLabel,
  height = 180,
  area = false,
  format = (v: number) => String(v),
  emptyLabel = "No data in this period",
}: {
  points: Point[];
  /** The previous period, drawn faintly behind, dashed so it cannot be
   *  mistaken for the current line in greyscale or by a colour-blind reader. */
  comparison?: Point[];
  /** Dates each line covers. A dashed line with no dates is unreadable: the
   *  reader cannot tell last week from last year. */
  seriesLabel?: string;
  comparisonLabel?: string;
  height?: number;
  area?: boolean;
  format?: (value: number) => string;
  emptyLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return <NoData height={height} label={emptyLabel} />;

  const width = 600;
  // Both lines share one scale, otherwise the comparison is drawn to a
  // different ruler and the shapes cannot honestly be compared.
  const domain = comparison?.length ? [...points, ...comparison] : points;
  const { x, y, high, low } = scale(points, width, height, domain);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const fill = `${line} L${x(points.length - 1)},${height - PAD.bottom} L${x(0)},${height - PAD.bottom} Z`;

  const active = hover === null ? null : points[hover];

  return (
    <div className="relative">
      {/* Stretched to whatever width the card has, like the sparkline. Without
          this the fixed 600-unit canvas kept its shape and sat centred, which
          left a full-width card mostly empty. Strokes use non-scaling-stroke,
          so they keep their weight when stretched. */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full text-brand"
        style={{ height }}
        role="img"
        aria-label={`Trend from ${points[0].label} to ${points[points.length - 1].label}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - box.left) / box.width;
          const index = Math.round(ratio * (points.length - 1));
          setHover(Math.min(Math.max(index, 0), points.length - 1));
        }}
      >
        {/* Baseline only: a full grid competes with a single thin series. */}
        <line
          x1={PAD.left}
          x2={width - PAD.right}
          y1={height - PAD.bottom}
          y2={height - PAD.bottom}
          stroke="currentColor"
          className="text-line"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        {area ? <path d={fill} fill="currentColor" opacity="0.12" /> : null}

        {comparison && comparison.length > 1 ? (
          <path
            d={comparison
              .map((p, i) => {
                // Aligned by position in the window, not by date: the previous
                // period covers different days of the same length.
                const step = (i / (comparison.length - 1)) * (points.length - 1);
                return `${i === 0 ? "M" : "L"}${x(step)},${y(p.value)}`;
              })
              .join(" ")}
            fill="none"
            stroke="currentColor"
            className="text-ink-faint"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {hover !== null ? (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={height - PAD.bottom}
              stroke="currentColor"
              className="text-line-strong"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ) : null}
      </svg>

      {/* The marker is HTML, not SVG: a circle in a stretched canvas turns
          into an oval. The canvas maps height one to one, so y is in pixels. */}
      {hover !== null ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-surface"
          style={{ left: `${(x(hover) / width) * 100}%`, top: y(points[hover].value) }}
        />
      ) : null}

      <div className="mt-1 flex justify-between text-[11px] text-ink-faint">
        <span>{points[0].label}</span>
        <span className="tabular">
          {format(low)} – {format(high)}
        </span>
        <span>{points[points.length - 1].label}</span>
      </div>

      {comparison && comparison.length > 1 ? (
        <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-ink-soft">
          <span className="flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden="true" className="text-brand">
              <line x1="0" y1="3" x2="18" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {seriesLabel ?? "This period"}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden="true" className="text-ink-faint">
              <line x1="0" y1="3" x2="18" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" />
            </svg>
            {comparisonLabel ?? "Previous period"}
          </span>
        </div>
      ) : null}

      {active ? (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg bg-surface px-2.5 py-1.5 text-xs shadow-md ring-1 ring-line">
          <span className="text-ink-soft">{active.label}</span>
          <span className="tabular ml-2 font-medium text-ink">{format(active.value)}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Trend glyph for a stat tile: the figure beside it carries the value. */
export function Sparkline({ points, height = 34 }: { points: Point[]; height?: number }) {
  if (points.length < 2) {
    return <div style={{ height }} aria-hidden="true" />;
  }

  const width = 140;
  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;

  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p.value - min) / span) * (height - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full text-brand"
      style={{ height }}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Magnitude across a handful of named things, biggest first. */
export function BarChart({
  points,
  height = 200,
  format = (v: number) => String(v),
  emptyLabel = "No data in this period",
}: {
  points: Point[];
  height?: number;
  format?: (value: number) => string;
  emptyLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return <NoData height={height} label={emptyLabel} />;

  const max = Math.max(...points.map((p) => p.value), 0) || 1;

  return (
    <div className="flex items-end gap-3" style={{ height }}>
      {points.map((point, index) => {
        const barHeight = Math.max((point.value / max) * (height - 42), 2);

        return (
          <div
            key={point.label}
            className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          >
            <span
              className={`tabular text-xs font-medium transition ${
                hover === index ? "text-ink" : "text-ink-faint"
              }`}
            >
              {format(point.value)}
            </span>
            {/* Rounded data-end, anchored flat to the baseline. */}
            <div
              className="w-full rounded-t-[4px] bg-brand transition-opacity"
              style={{ height: barHeight, opacity: hover === null || hover === index ? 1 : 0.55 }}
            />
            <span className="w-full truncate text-center text-[11px] text-ink-faint" title={point.label}>
              {point.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Period-over-period change. Carries an arrow as well as colour, so the
 * direction survives colour-blindness, greyscale print and forced-colours.
 */
export function DeltaChip({
  change,
  invert = false,
  neutral = false,
}: {
  change: number | null;
  /** For measures where down is good, such as cost per result. */
  invert?: boolean;
  /**
   * For measures with no good direction. An agency watching a client's ad
   * spend is one: spending more is not a win and spending less is not a
   * failure, and colouring it either way states an opinion the figure does
   * not support.
   */
  neutral?: boolean;
}) {
  if (change === null || !Number.isFinite(change)) {
    return <span className="text-xs text-ink-faint">No prior period</span>;
  }

  const rounded = Math.round(change * 10) / 10;
  const flat = Math.abs(rounded) < 0.05;
  const good = invert ? rounded < 0 : rounded > 0;

  const tone =
    flat || neutral
      ? "bg-surface-sunken text-ink-soft"
      : good
        ? "bg-positive-tint text-positive"
        : "bg-negative-tint text-negative";

  return (
    <span className={`tabular inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      <span aria-hidden="true">{flat ? "→" : rounded > 0 ? "▲" : "▼"}</span>
      {Math.abs(rounded)}%
      <span className="sr-only">
        {neutral
          ? "against the previous period"
          : good
            ? "better than the previous period"
            : "worse than the previous period"}
      </span>
    </span>
  );
}

/**
 * Two parts of one whole, such as answered against missed calls. The first
 * part is drawn in the brand colour and the second in a light tint of it: they
 * are one measure split two ways, not two different things, so no second hue.
 * Whatever is passed as children sits in the middle.
 */
export function Donut({
  parts,
  size = 164,
  children,
}: {
  parts: [Point, Point];
  size?: number;
  children?: ReactNode;
}) {
  const total = parts[0].value + parts[1].value;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const first = total > 0 ? (parts[0].value / total) * circumference : 0;
  const centre = size / 2;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${parts[0].label} ${parts[0].value}, ${parts[1].label} ${parts[1].value}`}
      >
        <circle cx={centre} cy={centre} r={radius} fill="none" strokeWidth={stroke} className="stroke-brand/20" />
        {first > 0 ? (
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-brand transition-[stroke-dasharray] duration-500"
            strokeDasharray={`${first} ${circumference}`}
            transform={`rotate(-90 ${centre} ${centre})`}
          />
        ) : null}
      </svg>
      {children ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}
