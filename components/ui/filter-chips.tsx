"use client";

/**
 * Status filter: every option shows how many items it holds, so the answer to
 * "how many of my clients are active?" is visible before anything is clicked.
 * An option holding nothing stays visible but muted -- hiding it would make
 * the set of states look different from one day to the next.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string; count: number }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => {
        const active = option.value === value;
        const empty = option.count === 0;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              active
                ? "bg-brand text-white ring-brand"
                : empty
                  ? "text-ink-faint ring-line hover:text-ink-soft"
                  : "text-ink-soft ring-line hover:bg-surface-sunken hover:text-ink"
            }`}
          >
            {option.label}
            <span
              className={`tabular rounded-full px-1.5 text-xs ${
                active ? "bg-white/20 text-white" : "bg-surface-sunken text-ink-soft"
              }`}
            >
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
