"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { signOut } from "@/lib/sign-out";
import { formatCurrency, formatNumber } from "@/lib/format";
import { RANGE_OPTIONS, span, type Period } from "@/lib/google-ads/date-range";
import { ReportPanel, useReport } from "@/components/report-panel";
import type { Campaign, ReportTab } from "@/components/client-report";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { ThemeToggle } from "@/components/ui/theme";
import { Identity, TopBar, TopBarTab } from "@/components/ui/top-bar";

/** A report someone can keep, without needing an export service. */
function downloadCsv(name: string, period: Period | undefined, campaigns: Campaign[]) {
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
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));

  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/\s+/g, "-").toLowerCase()}-${period?.start ?? "report"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The client's own report. Who they are and which agency prepared it arrive
 * from the server with the page, so the only request left is the report.
 */
export function ClientPortal({
  slug,
  agencyName,
  client,
}: {
  slug: string;
  agencyName: string;
  client: { id: string; name: string; googleAdsCustomerId: string | null };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ReportTab>("overview");
  const state = useReport(client.id, {
    notConfigured: "Your agency has not linked a Google Ads account to this workspace yet.",
    failed: "Your agency's Google Ads connection needs attention, so figures are paused.",
  });
  const { report } = state;
  const campaigns = report?.campaigns ?? [];

  // Switching view returns to the top: keeping the old scroll position drops
  // the reader into the middle of a page they have not seen yet.
  function selectTab(next: ReportTab) {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleLogout() {
    await signOut();
    router.push(`/agencies/${slug}/client-login`);
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* The client sees their own name first; the agency is who prepared it. */}
      <TopBar
        identity={<Identity name={client.name} subtitle={`Report by ${agencyName}`} />}
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
            <TopBarTab label="Calls" active={tab === "calls"} onClick={() => selectTab("calls")} />
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="nav"
              onClick={() => downloadCsv(client.name, report?.period, campaigns)}
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
              {report ? span(report.period.start, report.period.end) : ""}
            </p>
          </div>

          <Segmented
            label="Report period"
            options={RANGE_OPTIONS}
            value={state.range}
            onChange={state.selectRange}
          />
        </div>

        <ReportPanel state={state} tab={tab} />

        <section id="account" className="mt-8 rounded-2xl bg-surface px-5 py-4 ring-1 ring-line">
          <h2 className="text-sm font-medium text-ink">Account</h2>
          <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-[0.1em] text-ink-faint">
                Google Ads account
              </dt>
              <dd className="tabular mt-1 text-ink">{client.googleAdsCustomerId || "Not linked"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.1em] text-ink-faint">Managed by</dt>
              <dd className="mt-1 text-ink">{agencyName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.1em] text-ink-faint">
                Campaigns in this period
              </dt>
              <dd className="tabular mt-1 text-ink">
                {formatNumber(campaigns.length)}
                {report ? ` · ${formatCurrency(report.metrics.cost)} spent` : ""}
              </dd>
            </div>
          </dl>
        </section>

        <p className="mt-6 text-xs text-ink-faint">
          Figures come from Google Ads, compared with the previous period of the same length.
          Questions about this report go to {agencyName}.
        </p>
      </main>
    </div>
  );
}
