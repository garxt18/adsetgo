"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "../../lib/supabase";

const DEFAULT_MASTER_ADMIN_EMAIL = "devsaxena363@gmail.com";
const DEFAULT_MASTER_ADMIN_PASSWORD = "Devil@363";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState(DEFAULT_MASTER_ADMIN_EMAIL);
  const [password, setPassword] = useState(DEFAULT_MASTER_ADMIN_PASSWORD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    const user = data.user;

    if (user) {
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            email: user.email,
            role: user.email === DEFAULT_MASTER_ADMIN_EMAIL ? "master_admin" : "master_admin",
          },
          { onConflict: "id" }
        );

      if (profileError) {
        setLoading(false);
        setError(profileError.message);
        return;
      }
    }

    setLoading(false);
    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Master admin
        </p>
        <h1 className="mt-3 text-center text-3xl font-bold text-slate-900">
          Create admin account
        </h1>

        <p className="mt-2 text-center text-sm text-slate-600">
          Create the main administrator account for your SaaS platform.
        </p>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSignup} className="mt-8 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              placeholder="Enter your email"
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
              placeholder="Create a password"
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
            {loading ? "Creating account..." : "Create Admin Account"}
          </button>
        </form>
      </div>
    </main>
  );
}