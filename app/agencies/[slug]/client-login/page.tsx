"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

import { supabase } from "@/lib/supabase/browser";
import { AuthShell, Field, ForgotLink, FormError } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";

type AgencyData = {
  id: string;
  name: string;
  slug: string;
};

export default function ClientLoginPage() {
  const router = useRouter();
  const params = useParams();
  const slug = (Array.isArray(params?.slug) ? params.slug[0] : params?.slug) ?? "";

  const [agency, setAgency] = useState<AgencyData | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadingAgency, setLoadingAgency] = useState(true);

  // Load agency data on mount
  useEffect(() => {
    async function loadAgency() {
      setLoadingAgency(true);
      try {
        const res = await fetch(`/api/public/agencies/${slug}`);

        if (!res.ok) {
          setError("Agency not found");
          return;
        }

        setAgency((await res.json()) as AgencyData);
      } catch (err) {
        console.error("Error loading agency:", err);
        setError("Agency not found");
      } finally {
        setLoadingAgency(false);
      }
    }

    if (slug) {
      loadAgency();
    }
  }, [slug]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!agency) return;

    setLoading(true);
    setError("");

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      // Verify the user has client role for this agency
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, agency_id, client_id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        setError("Could not verify your permissions");
        setLoading(false);
        await supabase.auth.signOut();
        return;
      }

      if (profile.role !== "client" || profile.agency_id !== agency.id) {
        setError("You do not have access to this agency");
        setLoading(false);
        await supabase.auth.signOut();
        return;
      }

      setLoading(false);
      router.push(`/agencies/${slug}/client-dashboard`);
    }
  }

  if (loadingAgency) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-ink-soft">Loading…</p>
      </main>
    );
  }

  if (!agency) {
    return (
      <AuthShell eyebrow="Client portal" title="Workspace not found">
        <p className="text-sm text-ink-soft">
          Check the link your agency sent you, or ask them to send it again.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Client portal"
      title={agency.name}
      subtitle="Sign in to see how your campaigns are performing."
      footer={`Accounts are created by invitation. Check your email for a link from ${agency.name}.`}
    >
      <FormError message={error} />

      <form onSubmit={handleLogin} className="space-y-4">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@company.com"
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

      <ForgotLink returnTo={`/agencies/${slug}/client-login`} />
    </AuthShell>
  );
}
