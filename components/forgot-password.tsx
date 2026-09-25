"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { supabase } from "@/lib/supabase/browser";
import { AuthShell, FormError } from "@/components/ui/auth-shell";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { safeReturn } from "@/lib/safe-return";

/**
 * Self-service password reset: Supabase emails a link that lands on
 * /reset-password.
 *
 * The confirmation reads the same whether or not the address has an account.
 * Saying "no account with that email" would let anyone test addresses to find
 * out who uses the platform, and which agency a client belongs to.
 */

export function ForgotPassword() {
  const searchParams = useSearchParams();
  const returnTo = safeReturn(searchParams.get("from"));

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setError("");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setSending(false);

    if (resetError) {
      // A rate limit is worth naming, since waiting fixes it. Anything else is
      // reported without detail, and never as success: telling someone an
      // email is on its way when it is not is worse than an error.
      setError(
        resetError.status === 429 || /rate limit/i.test(resetError.message)
          ? "Too many reset requests in a short time. Wait a few minutes, or ask whoever invited you to send a reset link."
          : "The reset email could not be sent just now. Ask whoever invited you to send you a reset link."
      );
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell eyebrow="Reset password" title="Check your email">
        <p className="text-sm text-ink-soft">
          If <strong className="font-medium text-ink">{email.trim()}</strong> has an account, a
          link to choose a new password is on its way. Open it in this browser.
        </p>
        <p className="mt-3 text-sm text-ink-soft">
          Nothing arrived after a few minutes? Check spam, or ask whoever invited you to send a
          reset link directly.
        </p>
        <Link
          href={returnTo}
          className="mt-5 inline-block text-sm text-brand underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Reset password"
      title="Forgot your password?"
      subtitle="Enter the email you sign in with and we will send you a link to choose a new one."
    >
      <FormError message={error} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@company.com"
        />
        <Button type="submit" disabled={sending} className="w-full">
          {sending ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm">
        <Link
          href={returnTo}
          className="text-ink-soft underline-offset-4 transition hover:text-brand hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
