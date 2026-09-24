"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/browser";
import { signOut } from "@/lib/sign-out";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { ThemeToggle } from "@/components/ui/theme";
import { Identity, TopBar, TopBarTab } from "@/components/ui/top-bar";
import {
  ClientReport,
  type Campaign,
  type Changes,
  type Metrics,
  type TrendRow,
} from "@/components/client-report";
import { formatCurrency, formatNumber } from "@/lib/format";

type ClientData = {
  id: string;
  name: string;
  email: string;
  google_ads_customer_id: string;
  status: string;
};

type AgencyData = { id: string; name: string; slug: string };
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

/** "17 – 23 Sept 2026", or without the year for the shorter comparison label. */
function span(start: string, end: string, withYear = true): string {
  const from = new Date(start).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  const to = new Date(end).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" as const } : {}),
  });
  return `${from} – ${to}`;
}

/** A report someone can keep, without needing an export service. */
function downloadCsv(name: string, period: Period | null, campaigns: Campaign[]) {
  const header = ["Campaign", "Status", "Impressions", "Clicks", "Spend", "Conversions"];
  const rows = campaigns.map((c) => [
    `"${c.name.replace(/"/g, '""')}"`,
    c.status,
    c.impressions,
    c.clicks,
    c.cost,
    c.conversions,
  ]);

  const csv = [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/\s+/g, "-").toLowerCase()}-${period?.start ?? "report"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ClientDashboard() {
  const params = useParams();
  const router = useRouter();
  const slug = (Array.isArray(params?.slug) ? params.slug[0] : params?.slug) ?? "";

  const [agency, setAgency] = useState<AgencyData | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
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

  // Switching view returns to the top: keeping the old scroll position drops
  // the reader into the middle of a page they have not seen yet.
  function selectTab(next: "overview" | "campaigns") {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    async function loadAccount() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push(`/agencies/${slug}/client-login`);
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", sessionData.session.user.id)
        .maybeSingle();

      if (!profileData) {
        setError(
          "We could not load your account. Ask your agency to re-send your invitation."
        );
        setLoading(false);
        return;
      }

      if (profileData.role !== "client") {
        setError("This page is for client accounts.");
        setLoading(false);
        return;
      }

      // Row level security lets only master admins and an agency's own admin
      // select from `agencies`, so a client reads the public endpoint instead.
      const agencyRes = await fetch(`/api/public/agencies/${slug}`);

      if (!agencyRes.ok) {
        setError("This workspace could not be found.");
        setLoading(false);
        return;
      }

      const agencyData = (await agencyRes.json()) as AgencyData;

      if (agencyData.id !== profileData.agency_id) {
        setError("Your account belongs to a different agency.");
        setLoading(false);
        return;
      }

      const { data: clientData } = await supabase
        .from("clients")
        .select("*")
        .eq("id", profileData.client_id)
        .maybeSingle();

      if (!clientData) {
        setError("We could not load your account details.");
        setLoading(false);
        return;
      }

      setAgency(agencyData);
      setClient(clientData as ClientData);
      setLoading(false);
    }

    if (slug) loadAccount();
  }, [slug, router]);

  useEffect(() => {
    if (!client) return;

    // Guards against a slower earlier request landing after a faster later one
    // and overwriting the period the reader actually chose.
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
              ? "Your agency has not linked a Google Ads account to this workspace yet."
              : "Your agency's Google Ads connection needs attention, so figures are paused."
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
    router.push(`/agencies/${slug}/client-login`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-ink-soft">Loading your report…</p>
      </main>
    );
  }

  if (error || !agency || !client) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <Card className="max-w-md p-6">
          <p className="text-sm text-ink">{error || "This page is unavailable."}</p>
        </Card>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* The client sees their own name first; the agency is who prepared it. */}
      <TopBar
        identity={<Identity name={client.name} subtitle={`Report by ${agency.name}`} />}
        nav={
          <>
            <TopBarTab
              label="Overview"
              active={tab === "overview"}
              onClick={() => selectTab("overview")}
            />
            <TopBarTab
              label="Campaigns"
              active={tab === "campaigns"}
              onClick={() => selectTab("campaigns")}
            />
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="nav"
              onClick={() => downloadCsv(client.name, period, campaigns)}
              disabled={campaigns.length === 0}
            >
              Download CSV
            </Button>
            <ThemeToggle />
            <Button variant="secondary" size="nav" onClick={handleLogout}>
              Sign out
            </Button>
          </>
        }
      />

      <main id="overview" className="mx-auto max-w-[1400px] px-5 py-6 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand">
              Google Ads report
            </p>
            <h1 className="mt-1 text-2xl font-medium tracking-[-0.025em] text-ink sm:text-3xl">
              {client.name}
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              {period ? span(period.start, period.end) : ""}
            </p>
          </div>

          <Segmented
            label="Report period"
            options={DATE_RANGES}
            value={dateRange}
            onChange={(value) => {
              setReportState("loading");
              setDateRange(value);
            }}
          />
        </div>

        {isSample ? (
          <div className="animate-fade mt-5 flex items-center gap-2 rounded-xl bg-caution-tint px-4 py-2.5 text-sm text-caution">
            <span aria-hidden="true">●</span>
            <span>
              <strong className="font-medium">Sample data.</strong> These figures are
              generated for development and are not from Google Ads.
            </span>
          </div>
        ) : null}

        {reportState === "loading" ? (
          <Card className="mt-5 p-10">
            <p className="text-sm text-ink-soft">Loading figures…</p>
          </Card>
        ) : reportState === "unavailable" ? (
          <Card className="mt-5">
            <EmptyState title="Figures are not available yet" description={reportMessage} />
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

        <section
          id="account"
          className="mt-8 rounded-2xl bg-surface px-5 py-4 ring-1 ring-line"
        >
          <h2 className="text-sm font-medium text-ink">Account</h2>
          <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-[0.1em] text-ink-faint">
                Google Ads account
              </dt>
              <dd className="tabular mt-1 text-ink">
                {client.google_ads_customer_id || "Not linked"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.1em] text-ink-faint">
                Managed by
              </dt>
              <dd className="mt-1 text-ink">{agency.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.1em] text-ink-faint">
                Campaigns in this period
              </dt>
              <dd className="tabular mt-1 text-ink">
                {formatNumber(campaigns.length)}
                {metrics ? ` · ${formatCurrency(metrics.cost)} spent` : ""}
              </dd>
            </div>
          </dl>
        </section>

        <p className="mt-6 text-xs text-ink-faint">
          Figures come from Google Ads, compared with the previous period of the same
          length. Questions about this report go to {agency.name}.
        </p>
      </main>
    </div>
  );
}
