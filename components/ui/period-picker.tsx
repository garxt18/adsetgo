"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import {
  MAX_CUSTOM_DAYS,
  RANGE_OPTIONS,
  checkCustomRange,
  customRange,
  isRangeKey,
  latestReportDay,
  resolveRange,
  span,
  type RangeValue,
} from "@/lib/google-ads/date-range";

/**
 * The report period: the preset buttons, plus "Custom" for any range of days.
 *
 * Every report screen uses this one control, and whatever it chooses travels
 * to the server as a single `dateRange` value (lib/google-ads/date-range.ts),
 * so the figures, the Calls tab and the PDF all cover the same days.
 */
export function PeriodPicker({
  value,
  onChange,
}: {
  value: RangeValue;
  onChange: (next: RangeValue) => void;
}) {
  const isCustom = !isRangeKey(value);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [latest, setLatest] = useState("");
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);

  function openPanel() {
    // Starts from the period on screen, so adjusting it is a small edit.
    const current = resolveRange(value);
    setStart(current.start);
    setEnd(current.end);
    // Read now rather than while rendering: the server and browser clocks
    // may disagree, and a value computed during render would differ between them.
    setLatest(latestReportDay());
    setError("");
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  function apply(event: React.FormEvent) {
    event.preventDefault();
    const check = checkCustomRange(start, end);

    if (!check.ok) {
      setError(check.reason);
      return;
    }

    onChange(customRange(start, end));
    setOpen(false);
  }

  const [, from, to] = isCustom ? (value.match(/^(.+)\.\.(.+)$/) ?? []) : [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented<RangeValue> label="Report period" options={RANGE_OPTIONS} value={value} onChange={onChange} />

      <div ref={panel} className="relative">
        <div className="rounded-xl bg-surface-sunken p-1 ring-1 ring-line">
          <button
            type="button"
            aria-pressed={isCustom}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => (open ? setOpen(false) : openPanel())}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              isCustom
                ? "bg-surface text-ink shadow-[0_1px_2px_rgba(11,18,32,0.08)]"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            {isCustom && from && to ? span(from, to, false) : "Custom"}
          </button>
        </div>

        {open ? (
          <form
            role="dialog"
            aria-label="Custom date range"
            onSubmit={apply}
            // min/max still grey out impossible days in the picker; the
            // checking itself is ours, so the reason reads as a sentence
            // rather than the browser's generic tooltip.
            noValidate
            // Desktop: drops from the button's right edge. Phone: the button
            // wraps to the start of a row, so a right-anchored panel opened
            // half off the left edge; there it is pinned to the screen instead.
            className="animate-pop absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl bg-surface p-4 shadow-xl ring-1 ring-line max-sm:fixed max-sm:inset-x-4 max-sm:top-20 max-sm:mt-0 max-sm:w-auto"
          >
            <p className="text-sm font-medium text-ink">Custom range</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              Up to {MAX_CUSTOM_DAYS} days, ending yesterday at the latest. It is compared with the
              same number of days just before.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { label: "From", value: start, set: setStart, max: end || latest },
                { label: "To", value: end, set: setEnd, min: start, max: latest },
              ].map((field) => (
                <label key={field.label} className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">{field.label}</span>
                  <input
                    type="date"
                    required
                    value={field.value}
                    min={field.min}
                    max={field.max}
                    onChange={(event) => {
                      field.set(event.target.value);
                      setError("");
                    }}
                    className="w-full rounded-lg bg-surface px-2 py-1.5 text-xs text-ink ring-1 ring-line [color-scheme:light] dark:[color-scheme:dark] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  />
                </label>
              ))}
            </div>

            {error ? (
              <p role="alert" className="mt-3 rounded-lg bg-negative-tint px-2.5 py-2 text-xs text-negative">
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Apply
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
