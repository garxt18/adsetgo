"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/browser";
import { homePathFor } from "@/lib/home-path";
import { GoogleSignInButton } from "@/components/google-sign-in";
import { AuthShell, FormError } from "@/components/ui/auth-shell";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

// Local development convenience only. These come from the environment so that no
// working credential lives in source (and therefore in git history), and they are
// ignored entirely outside development.
const IS_DEV = process.env.NODE_ENV !== "production";
const DEV_ADMIN_EMAIL = process.env.NEXT_PUBLIC_DEV_ADMIN_EMAIL ?? "";
const DEV_ADMIN_PASSWORD = process.env.NEXT_PUBLIC_DEV_ADMIN_PASSWORD ?? "";

/**
 * The one sign-in screen behind all three: the platform's, an agency's and a
 * client's. Everyone signs in with Google; the platform screen alone keeps a
 * password form below it, the platform admin's backup.
 *
 * Every screen ends the same way: the server says where this person belongs,
 * from their profile. A screen never decides it from its own URL, so someone
 * who opens the wrong screen -- a client using their agency's link, say -- is
 * taken to their own workspace instead of being turned away.
 */
export function SignInForm({
  eyebrow,
  title,
  subtitle,
  footer,
  from,
  error: initialError = "",
  adminPassword = false,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  footer?: ReactNode;
  /** This screen's own path, so Google comes back to it. */
  from: string;
  /** Why the last Google sign-in was refused, if it was. */
  error?: string;
  /** The platform admin's password backup, with the local shortcut. */
  adminPassword?: boolean;
}) {
  const router = useRouter();
  const prefill = adminPassword && IS_DEV;

  const [email, setEmail] = useState(prefill ? DEV_ADMIN_EMAIL : "");
  const [password, setPassword] = useState(prefill ? DEV_ADMIN_PASSWORD : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  function fail(message: string) {
    setError(message);
    setLoading(false);
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    if (
      prefill &&
      DEV_ADMIN_EMAIL &&
      DEV_ADMIN_PASSWORD &&
      email.trim().toLowerCase() === DEV_ADMIN_EMAIL.toLowerCase() &&
      password === DEV_ADMIN_PASSWORD
    ) {
      // Sign out of any real session first. A real session always outranks
      // this cookie on the server, so an earlier sign-in (an agency or client
      // being tested) would otherwise stay in charge: /dashboard answered
      // "platform administrators only", and signing in again did the same.
      // Local scope: that account's other devices stay signed in.
      await supabase.auth.signOut({ scope: "local" });
      document.cookie = `dev_admin_override=${DEV_ADMIN_EMAIL}; path=/; max-age=86400; SameSite=Lax`;
      router.push("/dashboard");
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) return fail(signInError.message);
    if (!data.user) return fail("Sign-in succeeded but no session was created.");

    // Read the role, never write it: roles are fixed when an invitation is
    // created. The server works out where this person belongs, because a
    // client cannot read the agencies table to find their own workspace.
    const path = await homePathFor();

    if (!path) {
      await supabase.auth.signOut();
      // A password only opens the platform admin's account; agencies and
      // clients are refused by the server however they try, so say why.
      return fail("Agencies and clients sign in with Google. Use Continue with Google above.");
    }

    router.push(path);
  }

  return (
    <AuthShell eyebrow={eyebrow} title={title} subtitle={subtitle} footer={footer}>
      <FormError message={error} />

      <GoogleSignInButton from={from} />

      {adminPassword ? (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-ink-faint">
            <span className="h-px flex-1 bg-line" />
            Platform admin password
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="name@company.com"
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              placeholder="••••••••"
            />
            <Button type="submit" variant="secondary" disabled={loading} className="w-full">
              {loading ? "Signing in…" : "Sign in with password"}
            </Button>
          </form>
        </>
      ) : null}
    </AuthShell>
  );
}
