"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

import { supabase } from "@/lib/supabase";

type ClientData = {
  id: string;
  name: string;
  email: string;
  status: string;
};

type AgencyData = {
  id: string;
  name: string;
  slug: string;
};

export default function ClientSignupPage() {
  const router = useRouter();
  const params = useParams();
  const slug = (Array.isArray(params?.slug) ? params.slug[0] : params?.slug) ?? "";
  const clientId = (Array.isArray(params?.id) ? params.id[0] : params?.id) ?? "";

  const [client, setClient] = useState<ClientData | null>(null);
  const [agency, setAgency] = useState<AgencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // Load agency
      const { data: agencyData, error: agencyError } = await supabase
        .from("agencies")
        .select("id, name, slug")
        .eq("slug", slug)
        .maybeSingle();

      if (agencyError || !agencyData) {
        setError("Agency not found");
        setLoading(false);
        return;
      }

      setAgency(agencyData as AgencyData);

      // Load client
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .eq("agency_id", agencyData.id)
        .maybeSingle();

      if (clientError || !clientData) {
        setError("Client not found or invalid invitation");
        setLoading(false);
        return;
      }

      if (clientData.auth_user_id) {
        setError("This client account has already been activated");
        setLoading(false);
        return;
      }

      setClient(clientData as ClientData);
      setLoading(false);
    }

    if (slug && clientId) {
      loadData();
    }
  }, [slug, clientId]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!client || !agency) return;

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/client/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: client.email,
          password,
          clientId: client.id,
          agencySlug: agency.slug,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Signup failed");
        setSubmitting(false);
        return;
      }

      // Sign in the user
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: client.email,
        password,
      });

      if (signInError) {
        setError("Account created but login failed: " + signInError.message);
        setSubmitting(false);
        return;
      }

      setSubmitting(false);
      router.push(`/agencies/${slug}/client-dashboard`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="text-center">
          <p className="text-slate-600">Loading...</p>
        </div>
      </main>
    );
  }

  if (error || !client || !agency) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-center text-sm font-semibold text-red-600">
            {error || "Invalid invitation"}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Client Access
        </p>
        <h1 className="mt-3 text-center text-2xl font-bold text-slate-900">
          Complete Your Setup
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Create your account for {agency.name}
        </p>

        <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <p className="text-xs font-medium uppercase text-slate-600">Client Name</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{client.name}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-slate-600">Email</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{client.email}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-slate-600">Agency</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{agency.name}</p>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSignup} className="mt-6 space-y-4">
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
            <p className="mt-1 text-xs text-slate-500">Minimum 8 characters</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Confirm Password
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none transition focus:border-slate-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating account..." : "Create Account"}
          </button>
        </form>
      </div>
    </main>
  );
}
