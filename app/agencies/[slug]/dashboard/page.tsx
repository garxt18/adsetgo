"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { redirectHome } from "@/lib/home-path";
import { signOut } from "@/lib/sign-out";
import { AgencyShell } from "@/components/agency-shell";
import { ClientTable, type ClientRow } from "@/components/client-table";
import { DownloadCsvButton } from "@/components/download-csv";
import { DownloadPdfButton } from "@/components/download-pdf";
import { GoogleAdsAccountPicker, GoogleAdsAccounts } from "@/components/google-ads-accounts";
import { Sparkline, type Point } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card, SampleBanner, StatTile } from "@/components/ui/card";
import { CopyField } from "@/components/ui/copy";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PeriodPicker } from "@/components/ui/period-picker";
import { fileSlug } from "@/lib/export";
import { formatCurrency, formatNumber } from "@/lib/format";
import { formatGoogleAdsCustomerId } from "@/lib/google-ads/format";
import { span, type Period, type RangeValue } from "@/lib/google-ads/date-range";

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
  const [dateRange, setDateRange] = useState<RangeValue>("last_7_days");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSample, setIsSample] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCustomerId, setInviteCustomerId] = useState("");
  // The last name filled in from a Google Ads account, to tell it from a typed one.
  const autoName = useRef("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteLink, setInviteLink] = useState("");
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
        if (await redirectHome(router)) return;
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
          <Button variant="secondary" size="nav" className="mt-4" onClick={handleLogout}>
            Sign out and switch account
          </Button>
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
      {isSample ? <SampleBanner className="mb-4" /> : null}

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
            autoName.current = name;
            setInviteCustomerId(customerId);
            setInviteEmail("");
            setInviteLink("");
            setInviteError("");
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
            <div className="flex flex-wrap items-center gap-2">
              <DownloadCsvButton
                filename={`${fileSlug(agency.name)}-clients-${
                  period ? `${period.start}-to-${period.end}` : "report"
                }.csv`}
                rows={() => [
                  [
                    "Client",
                    "Google Ads account",
                    "Status",
                    "Spend (INR)",
                    "Spend change (%)",
                    "Conversions",
                    "Conversions change (%)",
                    "Clicks",
                    "Impressions",
                    "Cost per conversion (INR)",
                  ],
                  // Highest spend first, as the list and the PDF sort it.
                  ...[...clients]
                    .sort((a, b) => (b.metrics?.cost ?? -1) - (a.metrics?.cost ?? -1))
                    .map((c) => [
                      c.name,
                      c.googleAdsCustomerId ? formatGoogleAdsCustomerId(c.googleAdsCustomerId) : "",
                      c.status,
                      c.metrics?.cost,
                      c.change === null ? null : Math.round(c.change * 10) / 10,
                      c.metrics?.conversions,
                      c.conversionChange === null ? null : Math.round(c.conversionChange * 10) / 10,
                      c.metrics?.clicks,
                      c.metrics?.impressions,
                      c.metrics && c.metrics.conversions > 0 ? c.metrics.costPerConversion : null,
                    ]),
                ]}
              />
              <DownloadPdfButton
                href={`/api/agencies/${slug}/overview/pdf?dateRange=${encodeURIComponent(dateRange)}`}
              />
              <PeriodPicker value={dateRange} onChange={setDateRange} />
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Clients"
              value={formatNumber(clients.length)}
              caption={`${clients.filter((c) => c.status === "active").length} active`}
            />
            <StatTile label="Ad spend" value={totals ? formatCurrency(totals.cost) : "—"}>
              {spendSeries.length > 1 ? (
                <div className="mt-2">
                  <Sparkline points={spendSeries} height={26} />
                </div>
              ) : null}
            </StatTile>
            <StatTile
              label="Conversions"
              value={totals ? formatNumber(totals.conversions) : "—"}
            />
            <StatTile
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
            <CopyField value={inviteLink} label="Client invitation link" />
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

            <GoogleAdsAccountPicker
              slug={slug}
              value={inviteCustomerId}
              taken={clients.map((client) => client.googleAdsCustomerId ?? "")}
              onChange={({ customerId, name }) => {
                setInviteCustomerId(customerId);
                // Name the client after the account, unless a name of their own
                // has been typed; choosing another account then renames it too.
                if (name) {
                  setInviteName((current) =>
                    !current.trim() || current === autoName.current ? name : current
                  );
                  autoName.current = name;
                }
              }}
            />
            <Field label="Client name" value={inviteName} onChange={setInviteName} placeholder="Acme Corporation" />
            <Field
              label="Client email"
              value={inviteEmail}
              onChange={setInviteEmail}
              placeholder="contact@acme.com"
              type="email"
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
