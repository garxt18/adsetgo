"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/browser";
import { redirectHome } from "@/lib/home-path";
import { signOut } from "@/lib/sign-out";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, StatTile } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy";
import { Modal } from "@/components/ui/modal";
import { StatusPill } from "@/components/ui/status-pill";
import { BrandLockup } from "@/components/ui/brand";
import { FilterChips } from "@/components/ui/filter-chips";
import { ThemeToggle } from "@/components/ui/theme";
import { TopBar, TopBarLink } from "@/components/ui/top-bar";
import { ScrollX } from "@/components/ui/scroll-x";
import { formatNumber } from "@/lib/format";

type Agency = {
  id: string;
  name: string;
  slug: string;
  google_ads_manager_customer_id: string | null;
  google_ads_connection_status: string | null;
  created_at: string;
  client_count?: number;
  owner_email?: string | null;
};

function joined(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function MasterDashboard() {
  const router = useRouter();

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Agency | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AgencyFilter>("all");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch("/api/agencies");

      if (cancelled) return;

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (res.status === 403) {
        if (await redirectHome(router)) return;
        setError("This dashboard is for platform administrators only.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError("The agency list could not be loaded.");
        setLoading(false);
        return;
      }

      setAgencies((await res.json()) as Agency[]);

      // Display only; access was already decided by the API above.
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session && !cancelled) {
        setProfileEmail(sessionData.session.user.email ?? null);
      }

      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();

    return agencies.filter((agency) => {
      if (statusFilter !== "all" && agencyGroup(agency) !== statusFilter) return false;
      if (!term) return true;

      return (
        agency.name.toLowerCase().includes(term) ||
        agency.slug.toLowerCase().includes(term) ||
        (agency.owner_email ?? "").toLowerCase().includes(term)
      );
    });
  }, [agencies, query, statusFilter]);

  const filterOptions: Array<{ value: AgencyFilter; label: string; count: number }> = [
    { value: "all", label: "All", count: agencies.length },
    {
      value: "connected",
      label: "Connected",
      count: agencies.filter((a) => agencyGroup(a) === "connected").length,
    },
    {
      value: "attention",
      label: "Needs attention",
      count: agencies.filter((a) => agencyGroup(a) === "attention").length,
    },
    {
      value: "disconnected",
      label: "Not connected",
      count: agencies.filter((a) => agencyGroup(a) === "disconnected").length,
    },
  ];

  const totals = useMemo(
    () => ({
      agencies: agencies.length,
      clients: agencies.reduce((sum, agency) => sum + (agency.client_count ?? 0), 0),
      connected: agencies.filter((a) => a.google_ads_connection_status === "connected").length,
      needsAttention: agencies.filter(
        (a) => a.google_ads_connection_status === "expired" || a.google_ads_connection_status === "error"
      ).length,
    }),
    [agencies]
  );

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/agencies/${pendingDelete.slug}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "The agency could not be removed.");
        return;
      }

      const data = await res.json().catch(() => ({}));

      // The agency is gone either way; say so if some logins were left behind,
      // since they keep those email addresses from being invited again.
      if (data.loginsFailed > 0) {
        setNotice(
          `${pendingDelete.name} was removed, but ${data.loginsFailed} login${data.loginsFailed === 1 ? "" : "s"} could not be deleted. Remove ${data.loginsFailed === 1 ? "it" : "them"} in Supabase under Authentication, Users.`
        );
      }

      setAgencies((current) => current.filter((a) => a.slug !== pendingDelete.slug));
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-ink-soft">Loading agencies…</p>
      </main>
    );
  }

  if (error && agencies.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <Card className="max-w-md p-6">
          <p className="text-sm text-ink">{error}</p>
          {/* Signing in again would keep the same account; switching needs a sign-out. */}
          <Button variant="secondary" size="nav" className="mt-4" onClick={handleLogout}>
            Sign out and switch account
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <TopBar
        identity={
          <BrandLockup href="/dashboard" subtitle={profileEmail ?? "Platform admin"} />
        }
        nav={
          <>
            <TopBarLink href="/dashboard" label="Agencies" active />
            <TopBarLink href="/agencies/new" label="New agency" />
          </>
        }
        actions={
          <>
            <ThemeToggle />
            <Button variant="secondary" size="nav" onClick={handleLogout}>
              Sign out
            </Button>
          </>
        }
      />

      <main className="mx-auto max-w-[1400px] px-5 py-6 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand">
              Platform overview
            </p>
            <h1 className="mt-1 text-2xl font-medium tracking-[-0.025em] text-ink">Agencies</h1>
          </div>
          <ButtonLink href="/agencies/new" size="nav">
            + Create agency
          </ButtonLink>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl bg-negative-tint px-4 py-2.5 text-sm text-negative">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p className="mt-4 rounded-xl bg-caution-tint px-4 py-2.5 text-sm text-caution">
            {notice}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Agencies" value={formatNumber(totals.agencies)} />
          <StatTile label="Clients" value={formatNumber(totals.clients)} />
          <StatTile label="Google Ads connected" value={formatNumber(totals.connected)} />
          <StatTile
            label="Needs attention"
            value={formatNumber(totals.needsAttention)}
            tone={totals.needsAttention > 0 ? "caution" : undefined}
            caption={totals.needsAttention > 0 ? "Connection expired" : "All connections healthy"}
          />
        </div>

        <section className="animate-rise mt-5 rounded-2xl bg-surface ring-1 ring-line">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-medium tracking-[-0.01em] text-ink">All agencies</h2>
              <span className="tabular rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink-soft">
                {agencies.length}
              </span>
            </div>

            <label className="ml-auto">
              <span className="sr-only">Search agencies</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search agencies"
                className="w-48 rounded-xl bg-surface-sunken px-3 py-1.5 text-sm text-ink ring-1 ring-line transition placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              />
            </label>
          </header>

          <div className="border-b border-line px-5 py-3">
            <FilterChips
              label="Filter agencies by connection"
              options={filterOptions}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </div>

          {visible.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium text-ink">
                {agencies.length === 0 ? "No agencies yet" : "No agencies match this view"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
                {agencies.length === 0
                  ? "Create an agency and send its owner the invitation link to get them started."
                  : "Try another filter, or a different name, slug or owner email."}
              </p>
              {agencies.length === 0 ? (
                <div className="mt-5 flex justify-center">
                  <ButtonLink href="/agencies/new">Create the first agency</ButtonLink>
                </div>
              ) : null}
            </div>
          ) : (
            <ScrollX>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-[0.1em] text-ink-faint">
                    <th className="px-5 py-2.5">Agency</th>
                    <th className="px-5 py-2.5">Owner</th>
                    <th className="px-5 py-2.5">Google Ads</th>
                    <th className="px-5 py-2.5 text-right">Clients</th>
                    <th className="px-5 py-2.5">Created</th>
                    <th className="px-5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((agency) => (
                    <tr
                      key={agency.id}
                      className="group border-b border-line transition last:border-0 hover:bg-surface-sunken"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/agencies/${agency.slug}/dashboard`}
                          className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        >
                          <span
                            aria-hidden="true"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-xs font-semibold text-brand"
                          >
                            {agency.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink group-hover:text-brand">
                              {agency.name}
                            </span>
                            <span className="block truncate text-xs text-ink-faint">
                              /{agency.slug}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-ink-soft">
                        {agency.owner_email ?? (
                          <span className="text-ink-faint">Invitation not accepted</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={agency.google_ads_connection_status} />
                      </td>
                      <td className="tabular px-5 py-3 text-right text-ink">
                        {formatNumber(agency.client_count ?? 0)}
                      </td>
                      <td className="px-5 py-3 text-ink-soft">{joined(agency.created_at)}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <CopyButton
                            variant="secondary"
                            size="sm"
                            label="Copy login link"
                            text={() => `${window.location.origin}/agencies/${agency.slug}/login`}
                          />
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setPendingDelete(agency)}
                          >
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollX>
          )}
        </section>
      </main>

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={`Remove ${pendingDelete?.name ?? "agency"}?`}
        subtitle="This cannot be undone."
      >
        <p className="text-sm text-ink-soft">
          Removing this agency also removes its{" "}
          <strong className="font-medium text-ink">
            {formatNumber(pendingDelete?.client_count ?? 0)} client
            {(pendingDelete?.client_count ?? 0) === 1 ? "" : "s"}
          </strong>{" "}
          and deletes the logins of its owner and every client, so none of them can sign in
          again. The Google Ads accounts themselves are not touched.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPendingDelete(null)}>
            Keep agency
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Removing…" : "Remove agency"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

type AgencyFilter = "all" | "connected" | "attention" | "disconnected";

/** Which bucket an agency's Google Ads connection falls in. */
function agencyGroup(agency: Agency): Exclude<AgencyFilter, "all"> {
  const status = agency.google_ads_connection_status;
  if (status === "connected") return "connected";
  if (status === "expired" || status === "error") return "attention";
  return "disconnected";
}
