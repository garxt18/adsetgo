"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { signOut } from "@/lib/sign-out";
import { AgencyShell } from "@/components/agency-shell";
import { ResetLinkButton } from "@/components/reset-link-button";
import {
  ClientReport,
  type Campaign,
  type Changes,
  type Metrics,
  type TrendRow,
} from "@/components/client-report";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { StatusPill } from "@/components/ui/status-pill";

type Client = {
  id: string;
  agency_id: string;
  name: string;
  email: string;
  status: string;
  google_ads_customer_id: string;
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

function span(start: string, end: string, withYear = true): string {
  const from = new Date(start).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const to = new Date(end).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" as const } : {}),
  });
  return `${from} – ${to}`;
}

export default function AgencyClientPage() {
  const params = useParams();
  const router = useRouter();
  const slug = (Array.isArray(params?.slug) ? params.slug[0] : params?.slug) ?? "";
  const id = (Array.isArray(params?.id) ? params.id[0] : params?.id) ?? "";

  const [agencyName, setAgencyName] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [dateRange, setDateRange] = useState("last_7_days");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [previousMetrics, setPreviousMetrics] = useState<Metrics | null>(null);
  const [changes, setChanges] = useState<Changes>({});
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [previousTrend, setPreviousTrend] = useState<TrendRow[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [previousCampaigns, setPreviousCampaigns] = useState<Campaign[]>([]);
  const [period, setPeriod] = useState<Period | null>(null);
  const [reportState, setReportState] = useState<"loading" | "ready" | "unavailable">(
    "loading"
  );
  const [reportMessage, setReportMessage] = useState("");
  const [isSample, setIsSample] = useState(false);
  const [tab, setTab] = useState<"overview" | "campaigns">("overview");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadClient() {
      const res = await fetch(`/api/agencies/${slug}/clients/${id}`);

      if (cancelled) return;

      if (res.status === 401) {
        router.push(`/agencies/${slug}/login`);
        return;
      }

      if (!res.ok) {
        setError(
          res.status === 403
            ? "You do not have access to this client."
            : "This client could not be found."
        );
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (cancelled) return;

      setClient(data as Client);

      const agencyRes = await fetch(`/api/public/agencies/${slug}`);
      if (agencyRes.ok && !cancelled) {
        const agency = await agencyRes.json();
        setAgencyName(agency.name);
      }

      setLoading(false);
    }

    if (slug && id) loadClient();

    return () => {
      cancelled = true;
    };
  }, [slug, id, router]);

  useEffect(() => {
    if (!client) return;

    let cancelled = false;

    async function loadReport(clientId: string) {
      try {
        const query = new URLSearchParams({ clientId, dateRange });
        const res = await fetch(`/api/google-ads?${query.toString()}`);
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok || data.status === "error" || data.status === "not_configured") {
          setReportMessage(
            data.status === "not_configured"
              ? "This client has no Google Ads account linked yet."
              : "The Google Ads connection needs attention, so figures are paused."
          );
          setReportState("unavailable");
          return;
        }

        setMetrics(data.metrics as Metrics);
        setPreviousMetrics((data.previousMetrics ?? null) as Metrics | null);
        setChanges((data.changes ?? {}) as Changes);
        setTrend((data.trend ?? []) as TrendRow[]);
        setPreviousTrend((data.previousTrend ?? []) as TrendRow[]);
        setCampaigns((data.campaigns ?? []) as Campaign[]);
        setPreviousCampaigns((data.previousCampaigns ?? []) as Campaign[]);
        setPeriod((data.period ?? null) as Period | null);
        setIsSample(Boolean(data.isSample));
        setReportState("ready");
      } catch {
        if (cancelled) return;
        setReportMessage("The report could not be loaded. Try again in a moment.");
        setReportState("unavailable");
      }
    }

    loadReport(client.id);

    return () => {
      cancelled = true;
    };
  }, [client, dateRange]);

  async function handleLogout() {
    await signOut();
    router.push(`/agencies/${slug}/login`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-ink-soft">Loading client…</p>
      </main>
    );
  }

  if (error || !client) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <Card className="max-w-md p-6">
          <p className="text-sm text-ink">{error || "This page is unavailable."}</p>
          <Link
            href={`/agencies/${slug}/dashboard`}
            className="mt-3 inline-block text-sm text-brand underline"
          >
            Back to clients
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <AgencyShell
      agencyName={agencyName || "Agency"}
      slug={slug}
      active="clients"
      actions={
        <Button variant="secondary" size="nav" onClick={handleLogout}>
          Sign out
        </Button>
      }
    >
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-sm">
        <Link
          href={`/agencies/${slug}/dashboard`}
          className="text-ink-soft transition hover:text-ink"
        >
          Clients
        </Link>
        <span aria-hidden="true" className="text-ink-faint">
          /
        </span>
        <span className="font-medium text-ink">{client.name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-medium tracking-[-0.025em] text-ink">
              {client.name}
            </h2>
            <StatusPill status={client.status} />
          </div>
          <p className="tabular mt-1 text-sm text-ink-soft">
            {client.google_ads_customer_id || "No account linked"} · {client.email}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {period ? span(period.start, period.end) : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* What an agency actually needs here: the address to send the client. */}
          <Segmented
            label="Report period"
            options={DATE_RANGES}
            value={dateRange}
            onChange={(value) => {
              setReportState("loading");
              setDateRange(value);
            }}
          />
          <Button
            variant="secondary"
            size="nav"
            onClick={() => {
              // Read the origin when clicked, not while rendering: the server
              // has no window, and the difference is a hydration mismatch.
              navigator.clipboard.writeText(
                `${window.location.origin}/agencies/${slug}/client-login`
              );
              setCopied(true);
            }}
          >
            {copied ? "Link copied" : "Copy client login link"}
          </Button>
          <ResetLinkButton
            endpoint={`/api/agencies/${slug}/clients/${client.id}/access-link`}
            who={client.name}
            size="nav"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1 border-b border-line">
        <TabButton label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
        <TabButton
          label="Campaigns"
          active={tab === "campaigns"}
          onClick={() => setTab("campaigns")}
        />
      </div>

      {isSample ? (
        <div className="animate-fade mt-4 flex items-center gap-2 rounded-xl bg-caution-tint px-4 py-2.5 text-sm text-caution">
          <span aria-hidden="true">●</span>
          <span>
            <strong className="font-medium">Sample data.</strong> These figures are generated
            for development and are not from Google Ads.
          </span>
        </div>
      ) : null}

      {reportState === "loading" ? (
        <Card className="mt-4 p-10">
          <p className="text-sm text-ink-soft">Loading figures…</p>
        </Card>
      ) : reportState === "unavailable" ? (
        <Card className="mt-4 p-8">
          <p className="text-sm font-medium text-ink">Figures are not available</p>
          <p className="mt-1 text-sm text-ink-soft">{reportMessage}</p>
        </Card>
      ) : metrics ? (
        <ClientReport
          metrics={metrics}
          previousMetrics={previousMetrics}
          changes={changes}
          trend={trend}
          previousTrend={previousTrend}
          campaigns={campaigns}
          previousCampaigns={previousCampaigns}
          periodLabel={period ? span(period.start, period.end, false) : "This period"}
          comparisonLabel={
            period ? span(period.previousStart, period.previousEnd, false) : "Previous period"
          }
          tab={tab}
        />
      ) : null}
    </AgencyShell>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`-mb-px border-b-2 px-3 py-2 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        active
          ? "border-brand font-medium text-ink"
          : "border-transparent text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
