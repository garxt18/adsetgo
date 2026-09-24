import type { ReactNode } from "react";

/**
 * The client portal's headline answer.
 *
 * A row of four equal tiles makes every figure look equally important, which is
 * exactly the confusion a client arrives with. Advertising has an arithmetic --
 * you spent an amount, it produced results, so each result cost something --
 * and showing that as one sentence left to right tells them what happened
 * instead of asking them to work it out.
 */
export function ResultBand({
  spend,
  results,
  costPerResult,
  resultLabel = "Conversions",
}: {
  spend: string;
  results: string;
  costPerResult: string;
  resultLabel?: string;
}) {
  return (
    <div className="grid items-stretch gap-px overflow-hidden rounded-2xl bg-line ring-1 ring-line sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
      <Station label="Spend" value={spend} />
      <Operator symbol="÷" />
      <Station label={resultLabel} value={results} />
      <Operator symbol="=" />
      <Station label="Cost per result" value={costPerResult} emphasis />
    </div>
  );
}

function Station({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`bg-surface px-5 py-6 ${emphasis ? "sm:bg-brand-tint" : ""}`}>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </p>
      <p
        className={`tabular mt-2 text-3xl font-medium tracking-[-0.02em] ${
          emphasis ? "text-brand" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Operator({ symbol }: { symbol: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center bg-surface px-3 py-2 text-sm text-ink-faint sm:px-4"
    >
      {symbol}
    </div>
  );
}

/** Secondary figures, for the numbers that support the band above. */
export function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-surface px-5 py-4 ring-1 ring-line">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </p>
      <p className="tabular mt-1.5 text-xl font-medium tracking-[-0.01em] text-ink">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}
