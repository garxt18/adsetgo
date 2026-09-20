"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

import { supabase } from "@/lib/supabase";

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
      const { data: agencyData, error: agencyError } = await supabase
        .from("agencies")
        .select("id, name, slug")
        .eq("slug", slug)
        .maybeSingle();

      if (agencyError || !agencyData) {
        setError("Agency not found");
        setLoadingAgency(false);
        return;
      }

      setAgency(agencyData as AgencyData);
      setLoadingAgency(false);
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
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="text-center">
          <p className="text-slate-600">Loading...</p>
        </div>
      </main>
    );
  }

  if (!agency) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-center text-sm text-red-600">Agency not found</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Client Portal
        </p>
        <h1 className="mt-3 text-center text-2xl font-bold text-slate-900">
          {agency.name}
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Sign in to your account
        </p>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none transition focus:border-slate-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none transition focus:border-slate-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-slate-600">
          <p>
            Dont have an account?{" "}
            <span className="text-slate-700">
              Check your email for an invitation from {agency.name}
            </span>
          </p>
        </div>
      </div>
    </main>
  );
}
