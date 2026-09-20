"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

import { supabase } from "@/lib/supabase";

type AgencyData = {
  id: string;
  name: string;
  slug: string;
};

export default function AgencyLoginPage() {
  const router = useRouter();
  const params = useParams();
  const slug = (Array.isArray(params?.slug) ? params.slug[0] : params?.slug) ?? "";

  const [agency, setAgency] = useState<AgencyData | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loadingAgency, setLoadingAgency] = useState(true);

  // Load agency data on mount
  useEffect(() => {
    async function loadAgency() {
      setLoadingAgency(true);
      try {
        const res = await fetch(`/api/agencies/${slug}`);
        if (!res.ok) {
          setError("Agency not found");
          setLoadingAgency(false);
          return;
        }
        const agencyData = await res.json();
        setAgency(agencyData as AgencyData);
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
      // Verify the user has agency_admin role for this agency
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, agency_id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        setError("Could not verify your permissions");
        setLoading(false);
        return;
      }

      if (profile.role !== "agency_admin" || profile.agency_id !== agency.id) {
        setError("You do not have access to this agency");
        setLoading(false);
        // Sign out the user
        await supabase.auth.signOut();
        return;
      }

      setLoading(false);
      router.push(`/agencies/${slug}/dashboard`);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!agency) return;

    if (!firstName || !lastName) {
      setError("Please enter your name");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/agency-admin/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          agencyId: agency.id,
          agencySlug: agency.slug,
          firstName,
          lastName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Signup failed");
        setLoading(false);
        return;
      }

      // Sign in the user
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError("Account created but login failed: " + signInError.message);
        setLoading(false);
        return;
      }

      setLoading(false);
      router.push(`/agencies/${slug}/dashboard`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed");
      setLoading(false);
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
          Agency Access
        </p>
        <h1 className="mt-3 text-center text-2xl font-bold text-slate-900">
          {agency.name}
        </h1>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={isSignup ? handleSignup : handleLogin} className="mt-8 space-y-4">
          {isSignup && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    First Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none transition focus:border-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Last Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none transition focus:border-slate-500"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              placeholder="admin@agency.com"
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
            {isSignup && (
              <p className="mt-1 text-xs text-slate-500">
                Minimum 8 characters
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (isSignup ? "Creating account..." : "Logging in...") : (isSignup ? "Create Account" : "Login")}
          </button>
        </form>

        <div className="mt-4 text-center">
          <p className="text-sm text-slate-600">
            {isSignup ? "Already have an account? " : "Don't have an account? "}
            <button
              type="button"
              onClick={() => {
                setIsSignup(!isSignup);
                setError("");
                setEmail("");
                setPassword("");
                setFirstName("");
                setLastName("");
              }}
              className="font-semibold text-slate-900 underline hover:text-slate-700"
            >
              {isSignup ? "Login" : "Sign Up"}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
