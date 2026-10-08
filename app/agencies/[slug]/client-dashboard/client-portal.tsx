"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { signOut } from "@/lib/sign-out";
import { formatCurrency, formatNumber } from "@/lib/format";
import { span } from "@/lib/google-ads/date-range";
import { ReportPanel, useReport } from "@/components/report-panel";
import type { ReportTab } from "@/components/client-report";
import { CampaignCsvButton } from "@/components/download-csv";
import { DownloadPdfButton } from "@/components/download-pdf";
import { Button } from "@/components/ui/button";
import { PeriodPicker } from "@/components/ui/period-picker";
import { ThemeToggle } from "@/components/ui/theme";
import { Identity, TopBar, TopBarTab } from "@/components/ui/top-bar";

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

  // The period's campaigns as a spreadsheet, and the whole report as a PDF.
  const downloads = (
    <>
      <CampaignCsvButton
        clientName={client.name}
        report={report}
        disabled={state.status !== "ready"}
      />
      <DownloadPdfButton
        href={`/api/google-ads/pdf?dateRange=${encodeURIComponent(state.range)}`}
        disabled={state.status !== "ready"}
      />
    </>
  );

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
            <TopBarTab label="Ads" active={tab === "ads"} onClick={() => selectTab("ads")} />
          </>
        }
        actions={
          <>
            {/* In the bar from tablet width up; on a phone they have their own row below. */}
            <div className="hidden items-center gap-2 sm:flex">{downloads}</div>
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

          <div className="flex flex-wrap items-center gap-2">
            {/* On a phone the top bar has room only for the name, the theme
                and Sign out, so the downloads sit here, beside the period. */}
            <div className="flex items-center gap-2 sm:hidden">{downloads}</div>
            <PeriodPicker value={state.range} onChange={state.selectRange} />
          </div>
        </div>

        <ReportPanel state={state} tab={tab} />

        <section id="account" className="mt-8 rounded-2xl bg-surface px-5 py-4 ring-1 ring-line">
          <h2 className="text-sm font-medium text-ink">Account</h2>
          <dl className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
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
                {report ? ` · ${formatCurrency(report.metrics.cost, report.currency)} spent` : ""}
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
