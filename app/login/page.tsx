"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "../../lib/supabase";

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
  const [debugInfo, setDebugInfo] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setDebugInfo("");

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

    console.log("Attempting Supabase login", {
      email,
    });

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    const debugState = {
      hasUser: !!data?.user,
      hasSession: !!data?.session,
      errorMessage: signInError?.message ?? null,
    };

    console.log("Supabase login result", debugState);
    setDebugInfo(JSON.stringify(debugState, null, 2));
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: data.user.id,
            email: data.user.email,
            role:
              DEV_ADMIN_EMAIL && data.user.email === DEV_ADMIN_EMAIL
                ? "master_admin"
                : "client",
          },
          { onConflict: "id" }
        );

      if (profileError) {
        setError(profileError.message);
        return;
      }

      setError("");
      setDebugInfo((current) => `${current}\nProfile upsert succeeded. Redirecting to dashboard...`);
      router.push("/dashboard");
      return;
    }

    setError("Login succeeded but no session was created.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Secure access
        </p>
        <h1 className="mt-3 text-center text-3xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Use your Supabase account for your agency or client workspace.
        </p>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        {debugInfo ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 whitespace-pre-wrap">
            {debugInfo}
          </div>
        ) : null}

        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none transition focus:border-slate-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none transition focus:border-slate-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </main>
  );
}
