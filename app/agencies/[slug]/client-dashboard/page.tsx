"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type ClientData = {
  id: string;
  name: string;
  email: string;
  google_ads_customer_id: string;
  status: string;
};

type AgencyData = {
  id: string;
  name: string;
  slug: string;
};

type UserProfile = {
  id: string;
  email: string;
  role: string;
  client_id: string;
  agency_id: string;
};

export default function ClientDashboard() {
  const params = useParams();
  const router = useRouter();
  const slug = (Array.isArray(params?.slug) ? params.slug[0] : params?.slug) ?? "";

  const [agency, setAgency] = useState<AgencyData | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // Check user session
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push(`/agencies/${slug}/client-login`);
        return;
      }

      // Get user profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", sessionData.session.user.id)
        .maybeSingle();

      if (profileError || !profileData) {
        setError("Could not load your profile");
        setLoading(false);
        return;
      }

      // Verify user is client
      if (profileData.role !== "client") {
        setError("You do not have permission to access this page");
        setLoading(false);
        return;
      }

      setProfile(profileData as UserProfile);

      // Load agency
      const { data: agencyData, error: agencyError } = await supabase
        .from("agencies")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (agencyError || !agencyData) {
        setError("Agency not found");
        setLoading(false);
        return;
      }

      // Verify agency matches
      if (agencyData.id !== profileData.agency_id) {
        setError("You do not have access to this agency");
        setLoading(false);
        return;
      }

      setAgency(agencyData as AgencyData);

      // Load client data
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("id", profileData.client_id)
        .maybeSingle();

      if (clientError || !clientData) {
        setError("Could not load client data");
        setLoading(false);
        return;
      }

      setClient(clientData as ClientData);
      setLoading(false);
    }

    if (slug) {
      loadData();
    }
  }, [slug, router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push(`/agencies/${slug}/client-login`);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 md:p-10">
        <div className="flex items-center justify-center">
          <p className="text-slate-600">Loading...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 md:p-10">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        </div>
      </main>
    );
  }

  if (!agency || !client || !profile) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 md:p-10">
        <div className="flex items-center justify-center">
          <p className="text-slate-600">Data not found</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Client Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{client.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Agency: {agency.name}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Logout
          </button>
        </div>

        {/* Client Info */}
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase text-slate-600">Email</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{client.email}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase text-slate-600">Status</p>
            <p className="mt-2">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  client.status === "active"
                    ? "bg-green-100 text-green-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {client.status === "active" ? "Active" : "Invited"}
              </span>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase text-slate-600">Google Ads ID</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {client.google_ads_customer_id || "Not set"}
            </p>
          </div>
        </div>

        {/* Data Access */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">Your Data</h2>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">
              You have access to view your own campaigns, metrics, and performance data through your agencys platform.
            </p>
            <p className="mt-4 text-sm text-slate-600">
              <strong>Note:</strong> You can only see data related to your account ({client.name}). Data from other clients under {agency.name} is not visible to you.
            </p>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-3">
                <div className="text-lg">🔒</div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Data Isolation</p>
                  <p className="text-xs text-slate-600">Your data is securely isolated from other clients</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Available Features */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">Available Features</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[
              {
                title: "Campaign Monitoring",
                description: "View your active campaigns and their performance metrics",
              },
              {
                title: "Performance Analytics",
                description: "Track impressions, clicks, conversions, and ROI",
              },
              {
                title: "Real-time Metrics",
                description: "Access up-to-date performance data from Google Ads",
              },
              {
                title: "Account Management",
                description: "Manage your account settings and preferences",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h3 className="font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
