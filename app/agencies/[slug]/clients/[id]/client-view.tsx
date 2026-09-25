"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { signOut } from "@/lib/sign-out";
import { RANGE_OPTIONS, span } from "@/lib/google-ads/date-range";
import { AgencyShell } from "@/components/agency-shell";
import { ReportPanel, useReport } from "@/components/report-panel";
import { ResetLinkButton } from "@/components/reset-link-button";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy";
import { Segmented } from "@/components/ui/segmented";
import { StatusPill } from "@/components/ui/status-pill";

/** An agency's view of one client: the same report the client sees, plus access tools. */
export function ClientView({
  slug,
  agencyName,
  client,
}: {
  slug: string;
  agencyName: string;
  client: {
    id: string;
    name: string;
    email: string;
    status: string;
    googleAdsCustomerId: string | null;
  };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "campaigns">("overview");
  const state = useReport(client.id, {
    notConfigured: "This client has no Google Ads account linked yet.",
    failed: "The Google Ads connection needs attention, so figures are paused.",
  });
  const { report } = state;

  async function handleLogout() {
    await signOut();
    router.push(`/agencies/${slug}/login`);
  }

  return (
    <AgencyShell
      agencyName={agencyName}
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
            <h2 className="text-2xl font-medium tracking-[-0.025em] text-ink">{client.name}</h2>
            <StatusPill status={client.status} />
          </div>
          <p className="tabular mt-1 text-sm text-ink-soft">
            {client.googleAdsCustomerId || "No account linked"} · {client.email}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {report ? span(report.period.start, report.period.end) : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Report period"
            options={RANGE_OPTIONS}
            value={state.range}
            onChange={state.selectRange}
          />
          {/* What an agency actually needs here: the address to send the client. */}
          <CopyButton
            variant="secondary"
            size="nav"
            label="Copy client login link"
            copiedLabel="Link copied"
            text={() => `${window.location.origin}/agencies/${slug}/client-login`}
          />
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

      <ReportPanel state={state} tab={tab} />
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
