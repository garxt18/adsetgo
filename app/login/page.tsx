"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/browser";
import { AuthShell, Field, ForgotLink, FormError } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { homePathFor } from "@/lib/home-path";

// Local development convenience only. These come from the environment so that no
// working credential lives in source (and therefore in git history), and they are
// ignored entirely outside development.
const IS_DEV = process.env.NODE_ENV !== "production";
const DEV_ADMIN_EMAIL = process.env.NEXT_PUBLIC_DEV_ADMIN_EMAIL ?? "";
const DEV_ADMIN_PASSWORD = process.env.NEXT_PUBLIC_DEV_ADMIN_PASSWORD ?? "";

function setDevAdminOverride() {
  document.cookie = `dev_admin_override=${DEV_ADMIN_EMAIL}; path=/; max-age=86400; SameSite=Lax`;
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState(IS_DEV ? DEV_ADMIN_EMAIL : "");
  const [password, setPassword] = useState(IS_DEV ? DEV_ADMIN_PASSWORD : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (
      IS_DEV &&
      DEV_ADMIN_EMAIL &&
      DEV_ADMIN_PASSWORD &&
      email.trim().toLowerCase() === DEV_ADMIN_EMAIL.toLowerCase() &&
      password === DEV_ADMIN_PASSWORD
    ) {
      setDevAdminOverride();
      setLoading(false);
      router.push("/dashboard");
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    if (!data.user) {
      setError("Login succeeded but no session was created.");
      setLoading(false);
      return;
    }

    // Read the role, never write it: roles are fixed when an invitation is
    // created. The server works out where this person belongs, because a
    // client cannot read the agencies table to find their own workspace.
    const path = await homePathFor();

    if (!path) {
      await supabase.auth.signOut();
      setError("This account is not set up yet. Ask your administrator for an invitation.");
      setLoading(false);
      return;
    }

    router.push(path);
  }

  return (
    <AuthShell
      eyebrow="AdSetGo"
      title="Sign in"
      subtitle="Manage agencies, connections and client access."
    >
      <FormError message={error} />

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
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <ForgotLink returnTo="/login" />
    </AuthShell>
  );
}
