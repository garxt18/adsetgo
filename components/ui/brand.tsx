import Link from "next/link";

/**
 * The AdSetGo mark and wordmark, in one place so the name is never typed out
 * by hand on a page. When the domain and a real logo arrive, this is the only
 * file that changes.
 */

export const PRODUCT_NAME = "AdSetGo";

/** A rising line in the brand square: the product's whole promise in one glyph. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-xl bg-brand text-white"
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.5}
        height={size * 0.5}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M15 7h6v6" />
      </svg>
    </span>
  );
}

/** "AdSet" in ink, "Go" in the brand colour, so the name reads as two words. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`text-base font-semibold tracking-[-0.03em] text-ink ${className}`}>
      AdSet<span className="text-brand">Go</span>
    </span>
  );
}

/** Mark and wordmark together, linking home. */
export function BrandLockup({
  href = "/",
  subtitle,
}: {
  href?: string;
  subtitle?: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <BrandMark />
      <span className="min-w-0 leading-tight">
        <Wordmark className="block" />
        {subtitle ? (
          <span className="block truncate text-xs text-ink-faint">{subtitle}</span>
        ) : null}
      </span>
    </Link>
  );
}
