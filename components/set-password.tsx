"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { supabase } from "@/lib/supabase/browser";
import { homePathFor } from "@/lib/home-path";
import { AuthShell, Field, FormError } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";

/**
 * Where an invitation or a password-reset link lands. Both end the same way --
 * the person chooses a password and goes to their own workspace -- so they
 * share one screen and differ only in wording.
 *
 * A link can arrive in three shapes, and each is accepted:
 *
 *   ?token_hash=&type=   links this app builds (invitations, and reset links an
 *                        agency or admin issues). Works on any device.
 *   ?code=               Supabase's own reset email under the PKCE flow. Can
 *                        only be completed in the browser that asked for it,
 *                        because that browser holds the matching verifier.
 *   #access_token=       the older implicit format, for links already sent.
 *
 * The role was fixed when the account was created, so nothing about it is read
 * from the link or from anything the person types.
 */

type Mode = "invite" | "reset";

const COPY: Record<Mode, { eyebrow: string; title: string; button: string; invalid: string }> = {
  invite: {
    eyebrow: "Accept invitation",
    title: "Set your password",
    button: "Set password and continue",
    invalid: "This invitation link is invalid or has already been used. Ask for a new one.",
  },
  reset: {
    eyebrow: "Reset password",
    title: "Choose a new password",
    button: "Save new password",
    invalid:
      "This reset link is invalid, has expired, or was opened in a different browser from the one that asked for it. Request a new one.",
  },
};

export function SetPassword({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const copy = COPY[mode];

  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let settled = false;

    function accept(address: string | null) {
      if (settled) return;
      settled = true;
      setEmail(address ?? "");
      setChecking(false);
    }

    function reject() {
      if (settled) return;
      settled = true;
      setError(copy.invalid);
      setChecking(false);
    }

    async function completeSignIn() {
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      const code = searchParams.get("code");

      if (tokenHash) {
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          type: type === "recovery" ? "recovery" : type === "magiclink" ? "magiclink" : "invite",
          token_hash: tokenHash,
        });

        if (!verifyError && data.user) accept(data.user.email ?? null);
        else reject();
        return;
      }

      if (code) {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (!exchangeError && data.user) accept(data.user.email ?? null);
        else reject();
        return;
      }

      if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");

        if (access_token && refresh_token) {
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (!sessionError && data.user) {
            accept(data.user.email ?? null);
            return;
          }
        }
      }

      // Someone may simply already be signed in on this device.
      const { data } = await supabase.auth.getUser();
      if (data.user) accept(data.user.email ?? null);
      else reject();
    }

    completeSignIn();
  }, [searchParams, copy.invalid]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The two passwords do not match.");
      return;
    }

    setSaving(true);
    setError("");

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    const path = await homePathFor();

    if (!path) {
      setError("Your password is saved, but this account is not set up yet. Contact your administrator.");
      setSaving(false);
      return;
    }

    router.push(path);
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-ink-soft">Checking your link…</p>
      </main>
    );
  }

  if (email === null) {
    return (
      <AuthShell eyebrow={copy.eyebrow} title="This link cannot be used">
        <p className="text-sm text-ink-soft">{error}</p>
        {mode === "reset" ? (
          <a
            href="/forgot-password"
            className="mt-4 inline-block text-sm text-brand underline-offset-4 hover:underline"
          >
            Request a new reset link
          </a>
        ) : null}
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow={copy.eyebrow} title={copy.title} subtitle={email || undefined}>
      <FormError message={error} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder="••••••••"
          hint="At least 8 characters"
        />
        <Field
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          placeholder="••••••••"
        />
        <Button type="submit" disabled={saving} className="w-full">
          {saving ? "Saving…" : copy.button}
        </Button>
      </form>
    </AuthShell>
  );
}
