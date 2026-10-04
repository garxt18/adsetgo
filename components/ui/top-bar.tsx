import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The one navigation bar every page uses.
 *
 * Pages supply three things -- who this is, where you can go, and what you can
 * do -- and the bar decides how they look. That is what keeps every item the
 * same height (36px) and type size across the landing page and all three
 * dashboards, where each used to hand-build its own header and none matched.
 *
 * The bar is translucent: the page shows through, blurred, in both themes,
 * because the background is the canvas token at partial opacity rather than a
 * fixed colour.
 */

/** Shared by links and tabs so the two can never drift apart. */
function itemClass(active: boolean) {
  return `inline-flex h-9 shrink-0 items-center rounded-lg px-3.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
    active
      ? "bg-surface-sunken text-ink ring-1 ring-line"
      : "text-ink-soft hover:bg-surface-sunken hover:text-ink"
  }`;
}

export function TopBar({
  identity,
  nav,
  actions,
}: {
  identity: ReactNode;
  nav?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/65 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-5 sm:px-8">
        {identity}

        {nav ? (
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {nav}
          </nav>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
      </div>

      {/* On a phone the destinations drop to their own row rather than hiding. */}
      {nav ? (
        <nav
          aria-label="Main"
          className="relative mx-auto flex max-w-[1400px] items-center gap-1 overflow-x-auto px-5 pb-2 md:hidden"
        >
          {nav}
        </nav>
      ) : null}
    </header>
  );
}

/**
 * Who this workspace belongs to: the first letter in a square, then the name.
 * Agencies and clients see their own name here, never the product's.
 */
export function Identity({
  name,
  subtitle,
  href,
}: {
  name: string;
  subtitle?: string;
  href?: string;
}) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-semibold text-white"
      >
        {name.trim().slice(0, 1).toUpperCase() || "?"}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block max-w-[14rem] truncate text-sm font-semibold text-ink">
          {name}
        </span>
        {subtitle ? (
          <span className="block max-w-[14rem] truncate text-xs text-ink-faint">
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );

  return href ? (
    <Link
      href={href}
      className="flex min-w-9 items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {body}
    </Link>
  ) : (
    // min-w-9: the name may shrink to "…", the 36px badge never below itself.
    <div className="flex min-w-9 items-center gap-2.5">{body}</div>
  );
}

export function TopBarLink({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
      {label}
    </Link>
  );
}

export function TopBarTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={itemClass(active)}
    >
      {label}
    </button>
  );
}
