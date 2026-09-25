import type { ReactNode } from "react";

/**
 * Surfaces are separated by a hairline and a whisper of shadow rather than a
 * heavy border, so a page of stacked panels still reads as one document.
 */
export function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`rounded-2xl bg-surface ring-1 ring-line shadow-[0_1px_2px_rgba(11,18,32,0.04)] ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-base font-medium tracking-[-0.01em] text-ink">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-ink-soft">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * Said instead of a page that cannot be shown -- no access, wrong workspace,
 * a record that is gone -- so the reader learns why rather than facing a
 * blank screen.
 */
export function PageMessage({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <Card className="max-w-md p-6">
        <p className="text-sm text-ink">{message}</p>
        {action}
      </Card>
    </main>
  );
}

/**
 * Generated figures must announce themselves wherever they appear: a number
 * that cannot say it is invented has no business on a client's screen.
 */
export function SampleBanner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-fade flex items-center gap-2 rounded-xl bg-caution-tint px-4 py-2.5 text-sm text-caution ${className}`}
    >
      <span aria-hidden="true">●</span>
      <span>
        <strong className="font-medium">Sample data.</strong> These figures are generated for
        development and are not from Google Ads.
      </span>
    </div>
  );
}
