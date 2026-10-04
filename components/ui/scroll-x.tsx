import type { ReactNode } from "react";

/**
 * A box that scrolls sideways on its own when its content (a wide table, a row
 * of tabs) is wider than the screen, instead of widening the page.
 *
 * `relative` is the important part. Screen-reader labels (`sr-only`, as in
 * every change chip) are absolutely positioned, and an absolutely positioned
 * element escapes an overflow box unless that box is its containing block. The
 * agency client table's labels escaped this way and made the whole page 360px
 * wider on a phone: an empty dark strip anyone could scroll into.
 */
export function ScrollX({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`relative overflow-x-auto ${className}`}>{children}</div>;
}
