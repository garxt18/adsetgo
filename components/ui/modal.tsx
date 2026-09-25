"use client";

import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";

/**
 * Detail overlay.
 *
 * The page behind is blurred and dimmed rather than replaced, so the figure a
 * reader clicked stays in its context while they look into it. Escape and a
 * click outside both close, because a dead end in a client-facing report is
 * worse than any amount of detail.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Read through an effect event so the effect below depends on `open` alone.
  // Pages pass a fresh `onClose` arrow on every render, and with it in the
  // dependencies each keystroke in a form re-ran this effect: focus went back
  // to the button behind the dialog and then to the panel, so every text box
  // took one letter per click.
  const close = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("keydown", onKeyDown);

    // Focus moves into the panel so the keyboard lands somewhere sensible, and
    // the page behind cannot scroll away underneath the overlay.
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-fade absolute inset-0 cursor-default bg-ink/35 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="animate-pop relative max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-surface p-6 shadow-2xl ring-1 ring-line outline-none sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium tracking-[-0.01em] text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p> : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-ink-faint transition hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
