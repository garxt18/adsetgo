"use client";

import { useMemo, useState } from "react";

import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { HighlightGrid } from "@/components/ui/highlight-grid";
import { ScrollX } from "@/components/ui/scroll-x";
import { StatusPill } from "@/components/ui/status-pill";
import { useClientData } from "@/components/use-client-data";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { TOP_KEYWORDS, adHighlights, rankBy, type AdOrder, type AdsReport } from "@/lib/google-ads/ads";
import type { RangeValue } from "@/lib/google-ads/date-range";
import { AD_HIGHLIGHT_ORDER, adHighlightTiles, type AdHighlightKey } from "@/lib/report-copy";

const ORDER_NOTE: Record<AdOrder, string> = {
  conversions: "Every ad shown in this period, most conversions first.",
  impressions: "Most seen first.",
  clicks: "Most clicked first.",
};

const th = "px-5 py-2.5";
const td = "tabular px-5 py-2.5 text-right";

/** Where an ad or keyword runs, under its name. */
function Placement({ campaign, adGroup }: { campaign: string; adGroup: string }) {
  return (
    <span className="mt-0.5 block truncate text-xs font-normal text-ink-soft" title={`${campaign} › ${adGroup}`}>
      {campaign} › {adGroup}
    </span>
  );
}

/**
 * The Ads tab: which ads did best, which reached most people and which drew
 * the most clicks, each with the campaign it belongs to; then the keywords
 * that brought the most results.
 *
 * Loads only when opened, like Calls: its Google queries are its own.
 */
export function AdsReportView({ clientId, range }: { clientId: string; range: RangeValue }) {
  const { data, status, message } = useClientData<AdsReport>("/api/google-ads/ads", clientId, range);
  const [highlight, setHighlight] = useState<AdHighlightKey>("all");

  const ads = data?.ads;
  const currency = data?.currency ?? "";
  const highlights = useMemo(() => (ads ? adHighlightTiles(adHighlights(ads), currency) : []), [ads, currency]);
  const ordered = useMemo(() => (ads ? rankBy(ads, AD_HIGHLIGHT_ORDER[highlight]) : []), [ads, highlight]);
  const picked = highlights.find((item) => item.key === highlight)?.ad?.id;

  if (status === "unavailable") {
    return (
      <Card className="mt-4">
        <EmptyState title="Ads are not available yet" description={message} />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="mt-4 p-10">
        <p className="text-sm text-ink-soft">Loading ads…</p>
      </Card>
    );
  }

  const { keywords } = data;
  const money = (value: number) => formatCurrency(value, currency);
  const count = (value: number) => formatNumber(value, currency);

  return (
    // Dimmed, not blanked, while another period loads: the layout stays put.
    <div className={`transition-opacity ${status === "loading" ? "opacity-60" : ""}`}>
      <HighlightGrid label="Ad highlights" items={highlights} value={highlight} onChange={setHighlight} />

      <Card className="animate-rise mt-4">
        <CardHeader title="Ads" description={ORDER_NOTE[AD_HIGHLIGHT_ORDER[highlight]]} />
        {ordered.length === 0 ? (
          <EmptyState
            title="No ads were shown in this period"
            description="Choose a longer period. Performance Max campaigns build their ads from assets, so they have none listed here."
          />
        ) : (
          <ScrollX>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-[0.1em] text-ink-faint">
                  <th className={th}>Ad</th>
                  <th className={th}>Ad status</th>
                  <th className={`${th} text-right`}>Shown</th>
                  <th className={`${th} text-right`}>Clicks</th>
                  <th className={`${th} text-right`}>CTR</th>
                  <th className={`${th} text-right`}>Results</th>
                  <th className={`${th} text-right`}>Cost / result</th>
                  <th className={`${th} text-right`}>Spend</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((ad) => (
                  <tr
                    key={ad.id}
                    aria-current={ad.id === picked ? "true" : undefined}
                    className={`border-b border-line transition last:border-0 ${
                      ad.id === picked ? "bg-brand-tint" : "hover:bg-surface-sunken"
                    }`}
                  >
                    <td className="max-w-[24rem] px-5 py-2.5 font-medium text-ink">
                      <span className="block truncate" title={ad.headline}>
                        {ad.headline}
                      </span>
                      <Placement campaign={ad.campaign} adGroup={ad.adGroup} />
                    </td>
                    <td className="px-5 py-2.5">
                      <StatusPill status={ad.status} />
                    </td>
                    <td className={`${td} text-ink-soft`}>{count(ad.impressions)}</td>
                    <td className={`${td} text-ink-soft`}>{count(ad.clicks)}</td>
                    <td className={`${td} text-ink-soft`}>{formatPercent(ad.ctr)}</td>
                    <td className={`${td} text-ink`}>{count(ad.conversions)}</td>
                    <td className={`${td} text-ink-soft`}>{ad.conversions > 0 ? money(ad.costPerConversion) : "—"}</td>
                    <td className={`${td} text-ink`}>{money(ad.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        )}
      </Card>

      <Card className="animate-rise mt-4">
        <CardHeader
          title="Best performing keywords"
          description={
            keywords.length >= TOP_KEYWORDS
              ? `The ${TOP_KEYWORDS} that brought the most conversions, then clicks.`
              : "Most conversions first, then clicks."
          }
        />
        {keywords.length === 0 ? (
          <EmptyState
            title="No keyword traffic in this period"
            description="Keywords belong to Search campaigns. Display, video and Performance Max campaigns reach people without them."
          />
        ) : (
          <ScrollX>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-[0.1em] text-ink-faint">
                  <th className={th}>Keyword</th>
                  <th className={th}>Match</th>
                  <th className={`${th} text-right`}>Clicks</th>
                  <th className={`${th} text-right`}>Results</th>
                  <th className={`${th} text-right`}>Cost / result</th>
                  <th className={`${th} text-right`}>Spend</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((keyword) => (
                  <tr key={keyword.id} className="border-b border-line transition last:border-0 hover:bg-surface-sunken">
                    <td className="max-w-[22rem] px-5 py-2.5 font-medium text-ink">
                      <span className="block truncate" title={keyword.text}>
                        {keyword.text}
                      </span>
                      <Placement campaign={keyword.campaign} adGroup={keyword.adGroup} />
                    </td>
                    <td className="px-5 py-2.5 text-ink-soft">{keyword.matchType || "—"}</td>
                    <td className={`${td} text-ink-soft`}>{count(keyword.clicks)}</td>
                    <td className={`${td} text-ink`}>{count(keyword.conversions)}</td>
                    <td className={`${td} text-ink-soft`}>
                      {keyword.conversions > 0 ? money(keyword.costPerConversion) : "—"}
                    </td>
                    <td className={`${td} text-ink`}>{money(keyword.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        )}
      </Card>
    </div>
  );
}
