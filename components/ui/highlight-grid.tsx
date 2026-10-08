"use client";

/**
 * A row of headline answers ("Best campaign", "Best reach", ...), each a
 * button. Pressing one selects it, so the table below can order itself to
 * match; pressing it again returns to the first, the overall view.
 *
 * The first item is a count and reads as a large figure; the rest name a
 * campaign or an ad, so they read as text and truncate rather than wrap.
 */
export function HighlightGrid<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  /** `detail` is an optional last line, such as where an ad runs. */
  items: Array<{ key: T; label: string; value: string; caption: string; detail?: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => {
        const active = item.key === value;

        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? items[0].key : item.key)}
            style={{ animationDelay: `${index * 40}ms` }}
            className={`animate-rise min-w-0 rounded-2xl px-5 py-4 text-left ring-1 transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              active ? "bg-brand-tint ring-brand" : "bg-surface ring-line hover:ring-line-strong"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-faint">{item.label}</p>
            <p
              title={item.value}
              className={`mt-2 truncate font-medium tracking-[-0.02em] text-ink ${
                index === 0 ? "tabular text-2xl" : "text-base leading-8"
              }`}
            >
              {item.value}
            </p>
            <p className="tabular mt-0.5 truncate text-xs text-ink-soft">{item.caption}</p>
            {item.detail ? (
              <p title={item.detail} className="mt-0.5 truncate text-xs text-ink-faint">
                {item.detail}
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
