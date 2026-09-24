"use client";

/**
 * Period switcher.
 *
 * The choices sit on the page as buttons rather than inside a dropdown: a
 * reader comparing this week with last month should see both options without
 * opening anything, and switching period is the single most common thing
 * anyone does on a report.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string; short?: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-surface-sunken p-1 ring-1 ring-line"
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              active
                ? "bg-surface text-ink shadow-[0_1px_2px_rgba(11,18,32,0.08)]"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {/* The short form keeps the row on one line on a phone. */}
            <span className="sm:hidden">{option.short ?? option.label}</span>
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
