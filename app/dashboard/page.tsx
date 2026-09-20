"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "../../lib/supabase";

type Agency = {
  id: string;
  name: string;
  slug: string;
  google_ads_connection_status?: string | null;
  created_at: string;
};

type UserProfile = {
  id: string;
  email: string;
  role: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      // Check user session first
      const { data: sessionData } = await supabase.auth.getSession();

      // Check for dev admin override cookie
      const devAdminOverride = typeof document !== "undefined"
        ? document.cookie
            .split("; ")
            .find((row) => row.startsWith("dev_admin_override="))
            ?.split("=")[1]
        : undefined;

      if (!sessionData.session && !devAdminOverride) {
        if (isMounted) {
          setError("You must be logged in");
          setLoading(false);
        }
        return;
      }

      // If using dev override, set profile directly
      if (devAdminOverride && !sessionData.session) {
        if (isMounted) {
          setProfile({
            id: "dev-admin",
            email: devAdminOverride,
            role: "master_admin",
          });
        }
      } else if (sessionData.session) {
        // Get user profile from database
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", sessionData.session.user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Profile error:", profileError);
          // If profile doesn't exist, create it
          if (profileError.code === "PGRST116") {
            const { data: newProfile, error: createError } = await supabase
              .from("profiles")
              .insert({
                id: sessionData.session.user.id,
                email: sessionData.session.user.email,
                role: "master_admin",
              })
              .select()
              .maybeSingle();

            if (createError) {
              if (isMounted) {
                setError("Could not create profile: " + createError.message);
                setLoading(false);
              }
              return;
            }
            if (isMounted) setProfile(newProfile as UserProfile);
          } else {
            if (isMounted) {
              setError("Could not load your profile: " + profileError.message);
              setLoading(false);
            }
            return;
          }
        } else if (profileData && isMounted) {
          setProfile(profileData as UserProfile);
        }
      }

      // Load agencies from API instead of direct Supabase query
      const agenciesResponse = await fetch("/api/agencies");

      if (!agenciesResponse.ok) {
        const errorData = await agenciesResponse.json().catch(() => ({}));
        if (isMounted) {
          setError("Error loading agencies: " + (errorData.error || "Unknown error"));
          setLoading(false);
        }
        return;
      }

      const agenciesData = await agenciesResponse.json();
      if (isMounted) {
        setAgencies(agenciesData ?? []);
        setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleDeleteAgency(slug: string) {
    const confirmed = window.confirm("Delete this agency? This action cannot be undone.");
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/agencies/${slug}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert("Error deleting agency: " + (errorData.error || "Unknown error"));
        return;
      }

      setAgencies((current) => current.filter((agency) => agency.slug !== slug));
    } catch (error) {
      alert("Error deleting agency: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  }

  async function handleLogout() {
    // Clear dev admin cookie
    document.cookie = "dev_admin_override=; path=/; max-age=0";
    // Sign out from Supabase
    await supabase.auth.signOut();
    // Redirect to login
    router.push("/login");
  }

  function copyAgencyUrl(slug: string) {
    try {
      const url = `${window.location.origin}/agencies/${slug}`;
      navigator.clipboard.writeText(url);
      alert("Agency URL copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy URL", err);
      alert("Failed to copy URL");
    }
  }

  const totalClients = agencies.length * 4;
  const connectedAccounts = agencies.filter(
    (agency) => agency.google_ads_connection_status === "connected"
  ).length;

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
            <Link href="/login" className="mt-3 inline-block text-red-600 underline">
              Go to login
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Platform overview</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Master Dashboard</h1>
            {profile && <p className="mt-1 text-sm text-slate-600">Logged in as: {profile.email}</p>}
          </div>

          <div className="flex gap-2">
            <Link
              href="/agencies/new"
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
            >
              + Create Agency
            </Link>
            <button
              onClick={handleLogout}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total Agencies", value: agencies.length },
            { label: "Total Clients", value: totalClients },
            { label: "Connected Google Ads Accounts", value: connectedAccounts },
            { label: "Total Ad Spend", value: "$0" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 p-5">
            <h2 className="text-xl font-bold text-slate-900">Agencies</h2>
          </div>

          {agencies.length === 0 ? (
            <div className="p-5 text-slate-500">No agencies created yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-4 font-semibold">Agency Name</th>
                    <th className="p-4 font-semibold">Owner</th>
                    <th className="p-4 font-semibold">Clients</th>
                    <th className="p-4 font-semibold">Google Ads Status</th>
                    <th className="p-4 font-semibold">Created</th>
                    <th className="p-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agencies.map((agency) => (
                    <tr key={agency.id} className="border-t border-slate-200">
                      <td className="p-4 font-medium text-slate-900">{agency.name}</td>
                      <td className="p-4 text-slate-600">Agency Admin</td>
                      <td className="p-4 text-slate-600">{Math.max(1, Math.round(agencies.length / 2))}</td>
                      <td className="p-4">
                        <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                          {agency.google_ads_connection_status ?? "disconnected"}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600">
                        {new Date(agency.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <Link href={`/agencies/${agency.slug}`} className="font-medium text-blue-600 hover:underline">
                            Manage
                          </Link>
                          <button
                            type="button"
                            onClick={() => copyAgencyUrl(agency.slug)}
                            className="font-medium text-slate-700 hover:underline"
                          >
                            Copy URL
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAgency(agency.slug)}
                            className="font-medium text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
