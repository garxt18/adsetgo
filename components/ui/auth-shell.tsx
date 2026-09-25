import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared frame for the three sign-in screens.
 *
 * They differ only in who they address, so the chrome lives here and each page
 * supplies its own eyebrow, title and form. The mark is set in the brand blue
 * so the first thing a person sees on an agency's link is a product, not a
 * bare form.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl bg-surface p-8 ring-1 ring-line shadow-[0_1px_2px_rgba(11,18,32,0.04)]">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-2xl font-medium tracking-[-0.02em] text-ink">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1.5 text-sm text-ink-soft">{subtitle}</p>
          ) : null}

          <div className="mt-7">{children}</div>
        </div>

        {footer ? (
          <p className="mt-5 text-center text-sm text-ink-soft">{footer}</p>
        ) : null}
      </div>
    </main>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="mb-5 rounded-xl bg-negative-tint px-3.5 py-2.5 text-sm text-negative"
    >
      {message}
    </div>
  );
}

/**
 * The way back in for someone who has forgotten their password. It carries the
 * sign-in page it came from, so a reset client returns to their agency's
 * screen rather than the platform's.
 */
export function ForgotLink({ returnTo }: { returnTo: string }) {
  return (
    <p className="mt-4 text-center text-sm">
      <Link
        href={`/forgot-password?from=${encodeURIComponent(returnTo)}`}
        className="text-ink-soft underline-offset-4 transition hover:text-brand hover:underline"
      >
        Forgot your password?
      </Link>
    </p>
  );
}
