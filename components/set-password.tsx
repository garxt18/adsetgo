"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { supabase } from "@/lib/supabase/browser";
import { homePathFor } from "@/lib/home-path";
import { AuthShell, FormError } from "@/components/ui/auth-shell";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

/**
 * Where a password-reset link lands: the platform admin choosing a new backup
 * password. The app sends no reset email; a link arrives only if one is sent
 * from the Supabase dashboard. Agencies and clients sign in with Google and
 * have no password; a reset session of theirs is refused by the server
 * (lib/sign-in-methods.ts).
 *
 * A link can arrive in three shapes, and each is accepted:
 *
 *   ?token_hash=&type=   links built from a token hash. Works on any device.
 *   ?code=               Supabase's own reset email under the PKCE flow. Can
 *                        only be completed in the browser that asked for it,
 *                        because that browser holds the matching verifier.
 *   #access_token=       the older implicit format, for links already sent.
 */

const COPY = {
  eyebrow: "Reset password",
  title: "Choose a new password",
  button: "Save new password",
  invalid:
    "This reset link is invalid, has expired, or was opened in a different browser from the one that asked for it. Sign in with Google instead.",
};

export function SetPassword() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const copy = COPY;

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
          type: type === "magiclink" ? "magiclink" : "recovery",
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
        <a
          href="/login"
          className="mt-4 inline-block text-sm text-brand underline-offset-4 hover:underline"
        >
          Back to sign in
        </a>
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
