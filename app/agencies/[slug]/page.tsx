"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { supabase } from "../../../lib/supabase";

type Agency = {
  id: string;
  name: string;
  slug: string;
  google_ads_connection_status?: string | null;
};

type Client = {
  id: string;
  agency_id: string;
  name: string;
  email: string;
  google_ads_customer_id: string;
  created_at: string;
};

export default function AgencyPage() {
  const params = useParams();
  const slug = (Array.isArray(params?.slug) ? params.slug[0] : params?.slug) ?? "";

  const [agency, setAgency] = useState<Agency | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [googleAdsCustomerId, setGoogleAdsCustomerId] = useState("");

  useEffect(() => {
    async function loadAgency() {
      const { data, error } = await supabase.from("agencies").select("*").eq("slug", slug).maybeSingle();
      if (error) {
        console.error(error);
        return;
      }
      setAgency(data);
    }

    if (slug) {
      loadAgency();
    }
  }, [slug]);

  useEffect(() => {
    async function loadClients() {
      if (!agency) return;

      try {
        const res = await fetch(`/api/agencies/${slug}/clients`);
        if (!res.ok) {
          console.error("Failed to load clients", await res.text());
          return;
        }
        const data = await res.json();
        setClients(data ?? []);
      } catch (err) {
        console.error("Error loading clients", err);
      }
    }

    loadClients();
  }, [agency]);

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();

    if (!agency) return;

    if (!clientName || !clientEmail || !googleAdsCustomerId) {
      alert("Please fill in all fields.");
      return;
    }

    const googleAdsIdPattern = /^\d{3}-\d{3}-\d{4}$/;
    if (!googleAdsIdPattern.test(googleAdsCustomerId)) {
      alert("Google Ads Customer ID must be in this format: 123-456-7890");
      return;
    }

    if (editingClientId) {
      // update via admin API
      try {
        const res = await fetch(`/api/agencies/${slug}/clients/${editingClientId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: clientName, email: clientEmail, google_ads_customer_id: googleAdsCustomerId }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert("Error updating client: " + (err.error || res.statusText));
          return;
        }

        const updated = await res.json();
        setClients((currentClients) =>
          currentClients.map((client) => (client.id === editingClientId ? updated : client))
        );
      } catch (err) {
        alert("Error updating client: " + (err instanceof Error ? err.message : "Unknown error"));
        return;
      }
    } else {
      // create via admin API
      try {
        const res = await fetch(`/api/agencies/${slug}/clients`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: clientName, email: clientEmail, google_ads_customer_id: googleAdsCustomerId }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert("Error adding client: " + (err.error || res.statusText));
          return;
        }

        const data = await res.json();
        setClients((currentClients) => [data, ...currentClients]);
      } catch (err) {
        alert("Error adding client: " + (err instanceof Error ? err.message : "Unknown error"));
        return;
      }
    }

    setClientName("");
    setClientEmail("");
    setGoogleAdsCustomerId("");
    setShowClientForm(false);
    setEditingClientId(null);
    alert(editingClientId ? "Client updated successfully!" : "Client added successfully!");
  }

  async function handleDeleteClient(id: string) {
    const confirmed = window.confirm("Delete this client? This action cannot be undone.");
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/agencies/${slug}/clients/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("Error deleting client: " + (err.error || res.statusText));
        return;
      }
      setClients((currentClients) => currentClients.filter((client) => client.id !== id));
    } catch (err) {
      alert("Error deleting client: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  }

  function startEditClient(client: Client) {
    setEditingClientId(client.id);
    setClientName(client.name);
    setClientEmail(client.email);
    setGoogleAdsCustomerId(client.google_ads_customer_id);
    setShowClientForm(true);
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Agency workspace</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{agency ? agency.name : "Loading..."}</h1>
          </div>
          <button
            onClick={() => setShowClientForm(true)}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            + Create Client
          </button>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-4">
          {[
            { label: "Total Clients", value: clients.length },
            { label: "Connected Ads", value: clients.filter((client) => client.google_ads_customer_id).length },
            { label: "Status", value: agency?.google_ads_connection_status ?? "disconnected" },
            { label: "Spend", value: "$0" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-xl font-bold text-slate-900">Clients</h2>
          </div>

          {showClientForm && (
            <form onSubmit={handleAddClient} className="space-y-4 border-b border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">
                  {editingClientId ? "Edit Client" : "Create Client"}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowClientForm(false);
                    setEditingClientId(null);
                    setClientName("");
                    setClientEmail("");
                    setGoogleAdsCustomerId("");
                  }}
                  className="text-sm font-medium text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Client Name</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none transition focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Client Email</label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none transition focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Google Ads Customer ID</label>
                <input
                  type="text"
                  value={googleAdsCustomerId}
                  onChange={(e) => setGoogleAdsCustomerId(e.target.value)}
                  placeholder="123-456-7890"
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none transition focus:border-slate-500"
                />
              </div>

              <button type="submit" className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
                {editingClientId ? "Update Client" : "Save Client"}
              </button>
            </form>
          )}

          {clients.length === 0 ? (
            <div className="p-5 text-slate-500">No clients added yet.</div>
          ) : (
            <div className="space-y-3 p-5">
              {clients.map((client) => (
                <div key={client.id} className="rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-4">
                    <a href={`/agencies/${agency?.slug}/clients/${client.id}`} className="flex-1">
                      <h3 className="font-semibold text-slate-900">{client.name}</h3>
                      <p className="text-sm text-slate-500">{client.email}</p>
                      <p className="mt-3 text-sm text-slate-600">Google Ads ID: {client.google_ads_customer_id}</p>
                    </a>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditClient(client)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClient(client.id)}
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
