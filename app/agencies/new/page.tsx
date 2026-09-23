"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { sanitizeAgencySlug } from "../../../lib/google-ads/format";
import { supabase } from "../../../lib/supabase";

export default function NewAgencyPage() {
  const router = useRouter();

  const [agencyName, setAgencyName] = useState("");
  const [agencySlug, setAgencySlug] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [mccId, setMccId] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdAgency, setCreatedAgency] = useState<{
    id: string;
    slug: string;
    name: string;
    inviteLink: string | null;
  } | null>(null);
  const [debugSession, setDebugSession] = useState<unknown>(null);
  const [lsSnapshot, setLsSnapshot] = useState<Record<string, string>>({});
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function handleCreateAgency(e: React.FormEvent) {
    e.preventDefault();

    if (!agencyName || !ownerName || !ownerEmail) {
      alert("Agency name, owner name, and owner email are required.");
      return;
    }

    const finalSlug = sanitizeAgencySlug(agencySlug || agencyName);
    setLoading(true);

    try {
      const res = await fetch("/api/agencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agencyName,
          slug: finalSlug,
          google_ads_manager_customer_id: mccId || null,
          ownerEmail,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("Error creating agency: " + (err.error || res.statusText));
        setLoading(false);
        return;
      }

      const newAgency = await res.json();

      if (!newAgency.inviteLink) {
        alert(
          "Agency created, but the owner invitation could not be generated: " +
            (newAgency.inviteError ?? "unknown error")
        );
      }

      setCreatedAgency({
        id: newAgency.id,
        slug: newAgency.slug,
        name: newAgency.name,
        inviteLink: newAgency.inviteLink ?? null,
      });
    } catch (err) {
      console.error("Failed to create agency:", err);
      alert("Failed to create agency: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setLoading(false);
    }
  }

  async function loadSession() {
    const { data } = await supabase.auth.getSession();
    setDebugSession(data.session ?? null);

    if (typeof window !== "undefined") {
      const snap: Record<string, string> = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)!;
        snap[key] = window.localStorage.getItem(key) ?? "";
      }
      setLsSnapshot(snap);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setDebugSession(data.session ?? null);

      if (typeof window !== "undefined") {
        const snap: Record<string, string> = {};
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i)!;
          snap[key] = window.localStorage.getItem(key) ?? "";
        }
        setLsSnapshot(snap);
      }
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      init();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe?.();
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-2xl">
        {/* Debug panel */}
        <div className="fixed right-4 top-4 z-50 w-96 rounded-lg border bg-white p-3 text-xs shadow-lg">
          <div className="flex items-center justify-between">
            <strong className="text-sm">Auth Debug</strong>
            <button
              onClick={() => loadSession()}
              className="ml-2 rounded bg-slate-100 px-2 py-1 text-xs"
            >
              Refresh
            </button>
          </div>
          <div className="mt-2 max-h-40 overflow-auto text-[10px]">
            <div className="mb-1 font-semibold">Session:</div>
            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(debugSession, null, 2)}</pre>
            <div className="mt-2 mb-1 font-semibold">localStorage:</div>
            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(lsSnapshot, null, 2)}</pre>
          </div>
        </div>
        {createdAgency ? (
          <div>
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-600">
                ✓ Success
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Agency Created!</h1>
            </div>

            <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-medium text-green-900">
                  {createdAgency.name} has been successfully created.
                </p>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-slate-900">Share Admin Invitation</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Send this single-use link to {ownerEmail}. Only that address can
                  use it, and it works once:
                </p>
                <div className="mt-4 flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={createdAgency.inviteLink ?? "Invitation could not be generated"}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdAgency.inviteLink ?? "");
                      alert("Link copied to clipboard!");
                    }}
                    className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
                  >
                    Copy
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  After setting a password they sign in at {origin}/agencies/
                  {createdAgency.slug}/login
                </p>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-slate-900">Next Steps</h2>
                <ul className="mt-4 space-y-2">
                  <li className="flex gap-3">
                    <span className="text-sm font-semibold text-slate-600">1</span>
                    <span className="text-sm text-slate-600">
                      Share the signup link with the agency owner ({ownerEmail})
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-sm font-semibold text-slate-600">2</span>
                    <span className="text-sm text-slate-600">
                      They will create their account and access the agency dashboard
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-sm font-semibold text-slate-600">3</span>
                    <span className="text-sm text-slate-600">
                      They can then invite their clients and manage them
                    </span>
                  </li>
                </ul>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/dashboard")}
                  className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Back to Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatedAgency(null);
                    setAgencyName("");
                    setAgencySlug("");
                    setOwnerName("");
                    setOwnerEmail("");
                    setMccId("");
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Create Another Agency
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                Multi-tenant setup
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Create Agency</h1>
            </div>

            <form onSubmit={handleCreateAgency} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Agency Name</label>
                <input
                  type="text"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  placeholder="ABC Marketing"
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none ring-0 transition focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Agency Slug</label>
                <input
                  type="text"
                  value={agencySlug}
                  onChange={(e) => setAgencySlug(e.target.value)}
                  placeholder="abc-marketing"
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none ring-0 transition focus:border-slate-500"
                />
                <p className="mt-2 text-xs text-slate-500">Auto-generated from the name, but editable.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Agency Owner Name</label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="John Smith"
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none ring-0 transition focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Agency Owner Email</label>
                  <input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="owner@agency.com"
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none ring-0 transition focus:border-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Google Ads MCC / Manager Customer ID</label>
                <input
                  type="text"
                  value={mccId}
                  onChange={(e) => setMccId(e.target.value)}
                  placeholder="514-845-4497"
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none ring-0 transition focus:border-slate-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Creating..." : "Create Agency"}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
