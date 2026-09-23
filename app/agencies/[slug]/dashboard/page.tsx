"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type Agency = {
  id: string;
  name: string;
  slug: string;
  google_ads_connection_status?: string | null;
  google_ads_manager_customer_id?: string | null;
  created_at: string;
};

type ManagedGoogleAdsAccount = {
  customerId: string;
  name: string;
  status?: string;
  currencyCode?: string | null;
};

type Client = {
  id: string;
  agency_id: string;
  name: string;
  email: string;
  google_ads_customer_id: string;
  status: string;
  created_at: string;
};

type UserProfile = {
  id: string;
  email: string;
  role: string;
  agency_id: string;
};

type AgencyDebugInfo = {
  id: string;
  name: string;
  slug: string;
  google_ads_manager_customer_id?: string | null;
  google_ads_connection_status?: string | null;
  google_ads_refresh_token_masked?: string | null;
};

export default function AgencyDashboard() {
  const params = useParams();
  const router = useRouter();
  const slug = (Array.isArray(params?.slug) ? params.slug[0] : params?.slug) ?? "";

  const [agency, setAgency] = useState<Agency | null>(null);
  const [adminDebug, setAdminDebug] = useState<AgencyDebugInfo | null>(null);
  const [managedAccounts, setManagedAccounts] = useState<ManagedGoogleAdsAccount[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteCustomerId, setInviteCustomerId] = useState("");
  const [invitationUrl, setInvitationUrl] = useState("");
  const [showInvitationModal, setShowInvitationModal] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // Check user session
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push(`/agencies/${slug}/login`);
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

      // Verify user is agency_admin for this agency
      if (profileData.role !== "agency_admin") {
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

      // Verify agency matches user's agency
      if (agencyData.id !== profileData.agency_id) {
        setError("You do not have access to this agency");
        setLoading(false);
        return;
      }

      setAgency(agencyData as Agency);

      // Fetch admin debug info (masked token, manager id, etc.) from admin API
      try {
        const debugRes = await fetch(`/api/agencies/${slug}`);
        if (debugRes.ok) {
          const debugJson = await debugRes.json();
          setAdminDebug(debugJson);
        }
      } catch (err) {
        console.error("Failed to load admin debug info:", err);
      }

      try {
        const accountsRes = await fetch(`/api/google-ads/accounts?agencyId=${agencyData.id}`);
        if (accountsRes.ok) {
          const accountsJson = await accountsRes.json();
          setManagedAccounts(accountsJson.accounts ?? []);
        } else {
          setManagedAccounts([]);
        }
      } catch (err) {
        console.error("Failed to load Google Ads account list:", err);
        setManagedAccounts([]);
      }

      // Load clients from API
      const clientsResponse = await fetch(`/api/agencies/${slug}/clients`);
      
      if (clientsResponse.ok) {
        const clientsData = await clientsResponse.json();
        setClients(clientsData ?? []);
      } else {
        console.error("Error loading clients");
      }

      setLoading(false);
    }

    if (slug) {
      loadData();
    }
  }, [slug, router]);

  async function handleInviteClient(e: React.FormEvent) {
    e.preventDefault();
    if (!agency || !inviteEmail || !inviteName || !inviteCustomerId) {
      alert("Please fill in all fields");
      return;
    }

    // Create a client record
    const response = await fetch(`/api/agencies/${slug}/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: inviteName,
        email: inviteEmail,
        google_ads_customer_id: inviteCustomerId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      alert("Error inviting client: " + (errorData.error || "Unknown error"));
      return;
    }

    const newClient = await response.json();

    // The API creates the account and returns a single-use link for this exact
    // address; it cannot be rebuilt from the client id, which is the point.
    if (newClient.inviteLink) {
      setInvitationUrl(newClient.inviteLink);
      setShowInvitationModal(true);
    } else {
      alert(
        "Client saved, but the invitation could not be created: " +
          (newClient.inviteError ?? "unknown error")
      );
    }

    setInviteEmail("");
    setInviteName("");
    setInviteCustomerId("");
    setShowInviteForm(false);

    // Reload clients
    const clientsResponse = await fetch(`/api/agencies/${slug}/clients`);
    if (clientsResponse.ok) {
      const clientsData = await clientsResponse.json();
      setClients(clientsData ?? []);
    }
  }

  async function handleDeleteClient(clientId: string) {
    if (!confirm("Are you sure you want to delete this client?")) {
      return;
    }

    try {
      const response = await fetch(`/api/agencies/${slug}/clients/${clientId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert("Error deleting client: " + (errorData.error || "Unknown error"));
        return;
      }

      setClients((current) => current.filter((c) => c.id !== clientId));
    } catch (error) {
      alert("Error deleting client: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    alert("URL copied to clipboard!");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push(`/agencies/${slug}/login`);
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

  if (!agency || !profile) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 md:p-10">
        <div className="flex items-center justify-center">
          <p className="text-slate-600">Agency not found</p>
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
              Agency Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{agency.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Email: {profile.email}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowInviteForm(!showInviteForm)}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
            >
              + Invite Client
            </button>
            <button
              onClick={() => copyToClipboard(`${window.location.origin}/agencies/${slug}`)}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Copy URL
            </button>
            <button
              onClick={() => window.open(`/api/google-ads/auth?agencyId=${agency.id}`, "_blank")}
              className="inline-flex items-center justify-center rounded-xl border border-sky-500 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 shadow-sm transition hover:bg-sky-50"
            >
              Connect Google Ads
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Invite Form */}
        {showInviteForm && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Invite Client</h2>
            <form onSubmit={handleInviteClient} className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Client Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="ABC Corp"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none transition focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Client Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="contact@client.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none transition focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Google Ads Customer ID
                </label>
                <input
                  type="text"
                  required
                  placeholder="1234567890"
                  value={inviteCustomerId}
                  onChange={(e) => setInviteCustomerId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none transition focus:border-slate-500"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Format: 1234567890 or 123-456-7890
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Send Invitation
                </button>
                <button
                  type="button"
                  onClick={() => setShowInviteForm(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Invitation URL Modal */}
        {showInvitationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 max-w-lg rounded-2xl bg-white p-8 shadow-lg">
              <h2 className="text-lg font-semibold text-slate-900">Client Invitation Link</h2>
              <p className="mt-3 text-sm text-slate-600">
                Share this link with your client to sign up:
              </p>
              <div className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={invitationUrl}
                  readOnly
                  className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                />
                <button
                  onClick={() => copyToClipboard(invitationUrl)}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Copy
                </button>
              </div>
              <button
                onClick={() => setShowInvitationModal(false)}
                className="mt-6 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { label: "Total Clients", value: clients.length },
            { label: "Active Clients", value: clients.filter(c => c.status === "active").length },
            { label: "Pending Invitations", value: clients.filter(c => c.status === "invited").length },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>

        {agency.google_ads_connection_status === "expired" && (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
                  Google Ads
                </p>
                <h2 className="mt-2 text-xl font-bold text-amber-900">
                  Connection expired
                </h2>
                <p className="mt-1 text-sm text-amber-800">
                  Google no longer accepts this connection, so campaign data cannot
                  load. Reconnect to restore it.
                </p>
              </div>
              <button
                onClick={() =>
                  window.open(`/api/google-ads/auth?agencyId=${agency.id}`, "_blank")
                }
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
              >
                Reconnect Google Ads
              </button>
            </div>
          </div>
        )}

        {agency.google_ads_connection_status === "connected" && (
          <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Google Ads</p>
                <h2 className="mt-2 text-xl font-bold text-emerald-900">Available MCC Accounts</h2>
              </div>
              <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                MCC connected
              </span>
            </div>

            {managedAccounts.length === 0 ? (
              <p className="mt-4 text-sm text-emerald-800">
                Your MCC account is connected, but no child ad accounts were returned yet.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-emerald-200 bg-white">
                <table className="min-w-full text-left">
                  <thead className="border-b border-emerald-200 bg-emerald-50">
                    <tr>
                      <th className="px-4 py-3 text-sm font-semibold text-emerald-900">Account Name</th>
                      <th className="px-4 py-3 text-sm font-semibold text-emerald-900">Customer ID</th>
                      <th className="px-4 py-3 text-sm font-semibold text-emerald-900">Status</th>
                      <th className="px-4 py-3 text-sm font-semibold text-emerald-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managedAccounts.map((account) => (
                      <tr key={account.customerId} className="border-b border-emerald-100 last:border-b-0 hover:bg-emerald-50/60">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{account.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{account.customerId}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                            {account.status ?? "ENABLED"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setInviteCustomerId(account.customerId);
                                setShowInviteForm(true);
                              }}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              Select
                            </button>
                            <button
                              onClick={() => copyToClipboard(account.customerId)}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Copy ID
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
        )}

        {/* Clients Table */}
        {/* Admin Debug Panel */}
        {adminDebug && (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-amber-900">Admin Debug</h2>
            <p className="mt-2 text-sm text-amber-800">Manager ID: <strong>{adminDebug.google_ads_manager_customer_id ?? '—'}</strong></p>
            <p className="mt-1 text-sm text-amber-800">Refresh Token: <strong>{adminDebug.google_ads_refresh_token_masked ?? 'Not saved'}</strong></p>
            <p className="mt-2 text-sm text-amber-800">Clients:</p>
            <ul className="mt-2 ml-4 list-disc text-sm text-amber-900">
              {clients.map(c => (
                <li key={c.id}>{c.name} — {c.google_ads_customer_id ?? 'no customer id'}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">Your Clients</h2>
          
          {clients.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-slate-600">No clients yet. Invite your first client to get started.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.id} className="border-t border-slate-200 hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        {client.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {client.email}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            client.status === "active"
                              ? "bg-green-100 text-green-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {client.status === "active" ? "Active" : "Invited"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(client.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              copyToClipboard(
                                `${window.location.origin}/agencies/${slug}/clients/${client.id}`
                              )
                            }
                            className="rounded-lg bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200"
                          >
                            Copy Link
                          </button>
                          <button
                            onClick={() => handleDeleteClient(client.id)}
                            className="rounded-lg bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-200"
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
