"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

/**
 * Where an invitation link lands.
 *
 * The invite token is verified by Supabase before the browser gets here, so by
 * the time this page renders the visitor already holds a session for exactly
 * the invited address. All that remains is choosing a password. The role was
 * fixed when the invitation was created, so nothing about it is read from the
 * URL or from anything the visitor types.
 */
export default function AcceptInvitePage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadInvitedUser() {
      const { data, error: sessionError } = await supabase.auth.getUser();

      if (sessionError || !data.user) {
        setError(
          "This invitation link is invalid or has already been used. Ask for a new one."
        );
      } else {
        setEmail(data.user.email ?? null);
      }

      setChecking(false);
    }

    loadInvitedUser();
  }, []);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
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

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      setError("Your account was updated but the session was lost. Please log in.");
      setSaving(false);
      return;
    }

    // Send people to their own area: the profile decides, not the URL.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, agency_id, client_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) {
      router.push("/login");
      return;
    }

    if (profile.role === "master_admin") {
      router.push("/dashboard");
      return;
    }

    const { data: agency } = await supabase
      .from("agencies")
      .select("slug")
      .eq("id", profile.agency_id)
      .maybeSingle();

    if (!agency) {
      router.push("/login");
      return;
    }

    router.push(
      profile.role === "client"
        ? `/agencies/${agency.slug}/client-dashboard`
        : `/agencies/${agency.slug}/dashboard`
    );
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <p className="text-slate-600">Checking your invitation...</p>
      </main>
    );
  }

  if (!email) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-center text-sm text-red-600">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Accept Invitation
        </p>
        <h1 className="mt-3 text-center text-2xl font-bold text-slate-900">
          Set your password
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">{email}</p>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSetPassword} className="mt-8 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Password
            </label>
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
              Confirm password
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
            disabled={saving}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Set password and continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
