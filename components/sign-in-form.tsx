"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/browser";
import { homePathFor } from "@/lib/home-path";
import { AuthShell, ForgotLink, FormError } from "@/components/ui/auth-shell";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

// Local development convenience only. These come from the environment so that no
// working credential lives in source (and therefore in git history), and they are
// ignored entirely outside development.
const IS_DEV = process.env.NODE_ENV !== "production";
const DEV_ADMIN_EMAIL = process.env.NEXT_PUBLIC_DEV_ADMIN_EMAIL ?? "";
const DEV_ADMIN_PASSWORD = process.env.NEXT_PUBLIC_DEV_ADMIN_PASSWORD ?? "";

/**
 * The one sign-in form behind all three sign-in screens: the platform's, an
 * agency's and a client's. They differ only in wording.
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
  placeholder,
  returnTo,
  devShortcut = false,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  footer?: string;
  placeholder: string;
  /** This screen's own path, so a password reset comes back to it. */
  returnTo: string;
  /** Offer the local platform-admin shortcut. Only the platform screen does. */
  devShortcut?: boolean;
}) {
  const router = useRouter();
  const prefill = devShortcut && IS_DEV;

  const [email, setEmail] = useState(prefill ? DEV_ADMIN_EMAIL : "");
  const [password, setPassword] = useState(prefill ? DEV_ADMIN_PASSWORD : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      return fail("This account is not set up yet. Ask your administrator for an invitation.");
    }

    router.push(path);
  }

  return (
    <AuthShell eyebrow={eyebrow} title={title} subtitle={subtitle} footer={footer}>
      <FormError message={error} />

      <form onSubmit={handleLogin} className="space-y-4">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder={placeholder}
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="••••••••"
        />
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <ForgotLink returnTo={returnTo} />
    </AuthShell>
  );
}
