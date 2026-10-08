"use client";

import type { Report } from "@/components/report-panel";
import { DownloadLabel } from "@/components/download-pdf";
import { Button } from "@/components/ui/button";
import { fileSlug, toCsv } from "@/lib/export";

/**
 * Saves rows as a CSV, built in the browser from figures already on screen,
 * so it costs no request and always matches what the reader sees.
 */
export function DownloadCsvButton({
  filename,
  rows,
  disabled = false,
}: {
  filename: string;
  /** The heading row first. */
  rows: () => Array<Array<string | number | null | undefined>>;
  disabled?: boolean;
}) {
  function download() {
    // A byte-order mark, so Excel reads ₹ and accented names as UTF-8.
    const blob = new Blob(["﻿", toCsv(rows())], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <Button variant="secondary" size="nav" onClick={download} disabled={disabled} aria-label="Download CSV">
      <DownloadLabel format="CSV" />
    </Button>
  );
}

/**
 * A client's campaigns for the period on screen, as on the PDF's campaign
 * table. Used on the client's dashboard and on the agency's page for them.
 * Money is in the account's currency, named in the headings, and rates in
 * percent, all written as plain numbers so a spreadsheet can add them up.
 */
export function CampaignCsvButton({
  clientName,
  report,
  disabled,
}: {
  clientName: string;
  /** Null until the report has loaded. */
  report: Report | null;
  disabled?: boolean;
}) {
  const period = report?.period;
  const campaigns = report?.campaigns ?? [];
  const currency = report?.currency ?? "";

  return (
    <DownloadCsvButton
      // Both dates: with custom ranges, the start alone no longer names the period.
      filename={`${fileSlug(clientName)}-campaigns-${period ? `${period.start}-to-${period.end}` : "report"}.csv`}
      disabled={disabled}
      rows={() => [
        ["Campaign", "Status", "Impressions", "Clicks", "CTR (%)", `Spend (${currency})`, `Avg CPC (${currency})`, "Conversions"],
        ...[...campaigns]
          .sort((a, b) => b.cost - a.cost)
          .map((c) => [c.name, c.status, c.impressions, c.clicks, c.ctr, c.cost, c.averageCpc, c.conversions]),
      ]}
    />
  );
}
