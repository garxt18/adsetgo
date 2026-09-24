"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { signOut } from "@/lib/sign-out";
import { AgencyShell } from "@/components/agency-shell";
import { ClientTable, type ClientRow } from "@/components/client-table";
import { GoogleAdsAccounts } from "@/components/google-ads-accounts";
import { Sparkline, type Point } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { formatCurrency, formatNumber } from "@/lib/format";

type Agency = {
  id: string;
  name: string;
  slug: string;
  connectionStatus: string | null;
  managerCustomerId: string | null;
};

type Totals = {
  cost: number;
  clicks: number;
  conversions: number;
  impressions: number;
  costPerConversion: number;
};

type Period = {
  label: string;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
};

const DATE_RANGES = [
  { value: "last_7_days", label: "7 days", short: "7D" },
  { value: "last_14_days", label: "14 days", short: "14D" },
  { value: "last_30_days", label: "30 days", short: "30D" },
  { value: "this_month", label: "This month", short: "MTD" },
  { value: "last_month", label: "Last month", short: "LM" },
];

function span(start: string, end: string): string {
  const from = new Date(start).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const to = new Date(end).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${from} – ${to}`;
}

export default function AgencyDashboard() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = (Array.isArray(params?.slug) ? params.slug[0] : params?.slug) ?? "";
  const view = searchParams.get("view") === "connection" ? "connection" : "clients";

  const [agency, setAgency] = useState<Agency | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [dateRange, setDateRange] = useState("last_7_days");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSample, setIsSample] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCustomerId, setInviteCustomerId] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch(
        `/api/agencies/${slug}/overview?dateRange=${encodeURIComponent(dateRange)}`
      );

      if (cancelled) return;

      if (res.status === 401) {
        router.push(`/agencies/${slug}/login`);
        return;
      }

      if (res.status === 403) {
        setError("You do not have access to this agency.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError("This workspace could not be found.");
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (cancelled) return;

      setAgency(data.agency as Agency);
      setClients((data.clients ?? []) as ClientRow[]);
      setTotals(data.totals as Totals);
      setPeriod(data.period as Period);
      setIsSample(Boolean(data.isSample));
      setConnectionError(data.connectionError ?? null);
      setLoading(false);
    }

    if (slug) load();

    return () => {
      cancelled = true;
    };
  }, [slug, dateRange, router, reloadToken]);

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    setInviteBusy(true);
    setInviteError("");

    try {
      const res = await fetch(`/api/agencies/${slug}/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inviteName,
          email: inviteEmail,
          google_ads_customer_id: inviteCustomerId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setInviteError(data.error ?? "The client could not be added.");
        return;
      }

      if (!data.inviteLink) {
        setInviteError(
          data.inviteError ?? "The client was saved but no invitation could be created."
        );
        return;
      }

      setInviteLink(data.inviteLink);
      setInviteName("");
      setInviteEmail("");
      setInviteCustomerId("");
      setReloadToken((token) => token + 1);
    } catch {
      setInviteError("The client could not be added. Try again in a moment.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleLogout() {
    await signOut();
    router.push(`/agencies/${slug}/login`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-ink-soft">Loading your workspace…</p>
      </main>
    );
  }

  if (error || !agency) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <Card className="max-w-md p-6">
          <p className="text-sm text-ink">{error || "This page is unavailable."}</p>
        </Card>
      </main>
    );
  }

  // The first client's daily spend stands in for the agency shape until a
  // combined series is worth the extra queries.
  const spendSeries: Point[] = clients[0]?.spendSeries ?? [];

  return (
    <AgencyShell
      agencyName={agency.name}
      slug={slug}
      active={view === "connection" ? "connection" : "clients"}
      actions={
        <Button variant="secondary" size="nav" onClick={handleLogout}>
          Sign out
        </Button>
      }
    >
      {isSample ? (
        <div className="animate-fade mb-4 flex items-center gap-2 rounded-xl bg-caution-tint px-4 py-2.5 text-sm text-caution">
          <span aria-hidden="true">●</span>
          <span>
            <strong className="font-medium">Sample data.</strong> These figures are generated
            for development and are not from Google Ads.
          </span>
        </div>
      ) : null}

      {connectionError ? (
        <div className="animate-fade mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-caution-tint px-4 py-3 text-sm text-caution">
          <span>
            <strong className="font-medium">Google Ads needs reconnecting.</strong> Figures
            are paused until it is restored.
          </span>
          <Button
            size="nav"
            onClick={() => window.open(`/api/google-ads/auth?agencyId=${agency.id}`, "_blank")}
          >
            Reconnect
          </Button>
        </div>
      ) : null}

      {view === "connection" ? (
        <GoogleAdsAccounts
          slug={slug}
          connectionStatus={agency.connectionStatus}
          managerCustomerId={agency.managerCustomerId}
          clientCustomerIds={clients.map((client) => client.googleAdsCustomerId ?? "")}
          onReconnect={() =>
            window.open(`/api/google-ads/auth?agencyId=${agency.id}`, "_blank")
          }
          onAddClient={({ name, customerId }) => {
            // Start the same invitation flow, with the account already filled in.
            setInviteName(name);
            setInviteCustomerId(customerId);
            setInviteEmail("");
            setInviteLink("");
            setInviteError("");
            setCopied(false);
            setShowInvite(true);
          }}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-medium tracking-[-0.025em] text-ink">Clients</h1>
              <p className="mt-1 text-sm text-ink-soft">
                {period ? span(period.start, period.end) : ""}
              </p>
            </div>
            <Segmented
              label="Report period"
              options={DATE_RANGES}
              value={dateRange}
              onChange={setDateRange}
            />
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryTile
              label="Clients"
              value={formatNumber(clients.length)}
              caption={`${clients.filter((c) => c.status === "active").length} active`}
            />
            <SummaryTile
              label="Ad spend"
              value={totals ? formatCurrency(totals.cost) : "—"}
              points={spendSeries}
            />
            <SummaryTile
              label="Conversions"
              value={totals ? formatNumber(totals.conversions) : "—"}
            />
            <SummaryTile
              label="Cost per conversion"
              value={
                totals && totals.conversions > 0
                  ? formatCurrency(totals.costPerConversion)
                  : "—"
              }
            />
          </div>

          <ClientTable
            clients={clients}
            slug={slug}
            onInvite={() => {
              setInviteLink("");
              setInviteError("");
              setCopied(false);
              setShowInvite(true);
            }}
          />
        </>
      )}

      <Modal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        title={inviteLink ? "Client added" : "Add a client"}
        subtitle={
          inviteLink
            ? "Send them this private link so they can set a password."
            : "They get their own login and see only their own account."
        }
      >
        {inviteLink ? (
          <div>
            <div className="flex gap-2">
              <input
                readOnly
                value={inviteLink}
                className="w-full rounded-xl bg-surface-sunken px-3 py-2.5 text-sm text-ink ring-1 ring-line"
              />
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="mt-3 text-xs text-ink-soft">
              The link works once, and only for the address you entered. If it expires, add
              the client again to issue a new one.
            </p>
            <div className="mt-5 flex justify-end">
              <Button variant="secondary" onClick={() => setShowInvite(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="space-y-4">
            {inviteError ? (
              <p className="rounded-xl bg-negative-tint px-3.5 py-2.5 text-sm text-negative">
                {inviteError}
              </p>
            ) : null}

            <Field label="Client name" value={inviteName} onChange={setInviteName} placeholder="Acme Corporation" />
            <Field
              label="Client email"
              value={inviteEmail}
              onChange={setInviteEmail}
              placeholder="contact@acme.com"
              type="email"
            />
            <Field
              label="Google Ads customer ID"
              value={inviteCustomerId}
              onChange={setInviteCustomerId}
              placeholder="123-456-7890"
              hint="Shown at the top of their Google Ads account."
            />

            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setShowInvite(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviteBusy}>
                {inviteBusy ? "Adding…" : "Add client"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </AgencyShell>
  );
}

function SummaryTile({
  label,
  value,
  caption,
  points,
}: {
  label: string;
  value: string;
  caption?: string;
  points?: Point[];
}) {
  return (
    <div className="animate-rise rounded-2xl bg-surface px-4 py-3.5 ring-1 ring-line">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-faint">{label}</p>
      <p className="tabular mt-1.5 text-2xl font-medium tracking-[-0.02em] text-ink">{value}</p>
      {caption ? <p className="mt-0.5 text-xs text-ink-soft">{caption}</p> : null}
      {points && points.length > 1 ? (
        <div className="mt-2">
          <Sparkline points={points} height={26} />
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <input
        required
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl bg-surface px-3.5 py-2.5 text-sm text-ink ring-1 ring-line transition placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      />
      {hint ? <span className="mt-1 block text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}
