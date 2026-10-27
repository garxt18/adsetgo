"use client";

import { useMemo, useState } from "react";

import { DeltaChip } from "@/components/charts";
import { Card, CardHeader, EmptyState, StatTile } from "@/components/ui/card";
import { FilterChips } from "@/components/ui/filter-chips";
import { ScrollX } from "@/components/ui/scroll-x";
import { useClientData } from "@/components/use-client-data";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import {
  ALL_CHANNELS,
  byAction,
  byCampaign,
  byCategory,
  byGoal,
  channelLabel,
  conversionTotals,
  inChannel,
  type ConversionReport,
} from "@/lib/google-ads/conversions";
import type { RangeValue } from "@/lib/google-ads/date-range";

const th = "px-5 py-2.5";
const td = "tabular px-5 py-2.5 text-right";
const headRow =
  "border-b border-line text-left text-[11px] font-medium uppercase tracking-[0.1em] text-ink-faint";

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="pt-2 text-xs font-medium uppercase tracking-[0.14em] text-ink-faint">{children}</h2>
  );
}

/**
 * The Conversions tab: every kind of result the client's ads brought --
 * purchases, lead forms, sign-ups, calls, app installs, website visits, store
 * visits -- and which campaign types (Search, Shopping, Video, Display,
 * Performance Max, ...) brought them.
 *
 * Narrowing to one campaign type re-slices the figures already loaded; it
 * does not ask Google again. Loads only when opened, like Calls and Ads.
 */
export function ConversionReportView({ clientId, range }: { clientId: string; range: RangeValue }) {
  const { data, status, message } = useClientData<ConversionReport>(
    "/api/google-ads/conversions",
    clientId,
    range
  );
  const [picked, setPicked] = useState<string>(ALL_CHANNELS);

  const lines = useMemo(() => data?.lines ?? [], [data]);
  const previousLines = useMemo(() => data?.previousLines ?? [], [data]);
  const channels = useMemo(() => data?.channels ?? [], [data]);

  // A type picked for one period may not exist in the next; fall back to all.
  const known = new Set([...channels.map((c) => c.channel), ...lines.map((l) => l.channel)]);
  const channel = known.has(picked) ? picked : ALL_CHANNELS;

  const view = useMemo(() => {
    const current = inChannel(lines, channel);
    const previous = inChannel(previousLines, channel);
    return {
      totals: conversionTotals(current, previous),
      goals: byGoal(current, previous),
      categories: byCategory(current, previous),
      actions: byAction(current, previous),
      campaigns: byCampaign(current, previous),
    };
  }, [lines, previousLines, channel]);

  if (status === "unavailable") {
    return (
      <Card className="mt-4">
        <EmptyState title="Conversions are not available yet" description={message} />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="mt-4 p-10">
        <p className="text-sm text-ink-soft">Loading conversions…</p>
      </Card>
    );
  }

  const { currency } = data;
  const money = (value: number) => formatCurrency(value, currency);
  // Data-driven attribution splits conversions across campaigns, so small
  // figures can be fractional; Google shows those to one or two places too.
  const count = (value: number) =>
    Number.isInteger(value) || Math.abs(value) >= 100 ? formatNumber(value, currency) : value.toFixed(1);

  if (lines.length === 0 && previousLines.length === 0) {
    return (
      <Card className="mt-4">
        <EmptyState
          title="No conversions recorded in this period"
          description="Conversions appear here once conversion tracking is set up in Google Ads: purchases, lead forms, sign-ups, calls, app installs, page visits and the rest. None were recorded in this period or the one before."
        />
      </Card>
    );
  }

  const { totals, goals, categories, actions, campaigns } = view;
  const scope = channels.filter((c) => channel === ALL_CHANNELS || c.channel === channel);
  const spend = scope.reduce((sum, c) => sum + c.cost, 0);
  const paid = scope.reduce((sum, c) => sum + c.conversions, 0);
  const secondary = Math.max(totals.allConversions - totals.conversions, 0);
  const mostCategory = Math.max(...categories.map((c) => c.conversions), 1);

  const options = [
    { value: ALL_CHANNELS, label: "All types", count: channels.reduce((sum, c) => sum + c.campaigns, 0) },
    ...[...known].map((code) => ({
      value: code,
      label: channelLabel(code),
      count: channels.find((c) => c.channel === code)?.campaigns ?? 0,
    })),
  ];

  return (
    // Dimmed, not blanked, while another period loads: the layout stays put.
    <div className={`mt-4 space-y-4 transition-opacity ${status === "loading" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips label="Campaign type" options={options} value={channel} onChange={setPicked} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Conversions" value={count(totals.conversions)}>
          <div className="mt-1.5">
            <DeltaChip change={totals.change} />
          </div>
        </StatTile>
        <StatTile label="Conversion value" value={money(totals.value)}>
          <div className="mt-1.5">
            <DeltaChip change={totals.valueChange} />
          </div>
        </StatTile>
        <StatTile
          label="Cost / conversion"
          value={paid > 0 ? money(spend / paid) : "—"}
          caption={`${money(spend)} spent`}
        />
        <StatTile
          label="All conversions"
          value={count(totals.allConversions)}
          caption={
            secondary > 0
              ? `Includes ${count(secondary)} from secondary actions`
              : "No secondary actions recorded"
          }
        />
      </div>

      <SectionTitle>What customers did</SectionTitle>

      {goals.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {goals.map((goal) => (
            <StatTile
              key={goal.key}
              label={goal.label}
              value={goal.conversions > 0 ? count(goal.conversions) : count(goal.allConversions)}
              caption={
                goal.conversions > 0
                  ? totals.conversions > 0
                    ? `${Math.round((goal.conversions / totals.conversions) * 100)}% of conversions${
                        goal.value > 0 ? ` · ${money(goal.value)} value` : ""
                      }${goal.goal === "calls" ? " · every call is on the Calls tab" : ""}`
                    : undefined
                  : goal.allConversions > 0
                    ? "Secondary actions only: not counted as conversions"
                    : "None in this period"
              }
            >
              <div className="mt-1.5">
                <DeltaChip change={goal.change} />
              </div>
            </StatTile>
          ))}
        </div>
      ) : null}

      <Card className="animate-rise">
        <CardHeader
          title="Conversions by type"
          description="Each conversion category the account tracks, most results first."
        />
        {categories.length === 0 ? (
          <EmptyState
            title="Nothing recorded for this campaign type"
            description="Choose another campaign type or a longer period."
          />
        ) : (
          <ul className="space-y-4 px-5 py-4">
            {categories.map((category) => (
              <li key={category.key}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="truncate text-ink">{category.label}</span>
                  <span className="flex items-center gap-2">
                    {category.value > 0 ? (
                      <span className="tabular text-xs text-ink-soft">{money(category.value)}</span>
                    ) : null}
                    <DeltaChip change={category.change} />
                    <span className="tabular font-medium text-ink">
                      {category.conversions > 0 ? count(category.conversions) : "—"}
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-surface-sunken">
                  <div
                    className="h-2 rounded-full bg-brand transition-[width] duration-500"
                    style={{ width: `${(category.conversions / mostCategory) * 100}%` }}
                  />
                </div>
                {category.allConversions > category.conversions ? (
                  <p className="mt-1 text-xs text-ink-faint">
                    {count(category.allConversions - category.conversions)} more recorded by secondary actions
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SectionTitle>By campaign type</SectionTitle>

      <Card className="animate-rise">
        <CardHeader
          title="Campaign types"
          description="Spend and results for each kind of campaign. Pick one to narrow the whole tab to it."
        />
        {channels.length === 0 ? (
          <EmptyState title="No campaigns ran in this period" description="Choose a longer period." />
        ) : (
          <ScrollX>
            <table className="w-full text-sm">
              <thead>
                <tr className={headRow}>
                  <th className={th}>Campaign type</th>
                  <th className={th}>Main result</th>
                  <th className={`${th} text-right`}>Campaigns</th>
                  <th className={`${th} text-right`}>Spend</th>
                  <th className={`${th} text-right`}>Conversions</th>
                  <th className={`${th} text-right`}>Cost / conv.</th>
                  <th className={`${th} text-right`}>Conv. rate</th>
                  <th className={`${th} text-right`}>Value</th>
                  <th className={`${th} text-right`}>ROAS</th>
                  <th className={`${th} text-right`}>vs before</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((line) => {
                  const active = line.channel === channel;
                  const main = byCategory(inChannel(lines, line.channel), []).find((c) => c.conversions > 0);
                  return (
                    <tr
                      key={line.channel}
                      aria-current={active ? "true" : undefined}
                      className={`border-b border-line transition last:border-0 ${
                        active ? "bg-brand-tint" : "hover:bg-surface-sunken"
                      }`}
                    >
                      <td className="px-5 py-2.5 font-medium text-ink">
                        <button
                          type="button"
                          onClick={() => setPicked(active ? ALL_CHANNELS : line.channel)}
                          className="text-left transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        >
                          {line.label}
                        </button>
                      </td>
                      <td className="max-w-[12rem] truncate px-5 py-2.5 text-ink-soft" title={main?.label}>
                        {main?.label ?? "—"}
                      </td>
                      <td className={`${td} text-ink-soft`}>{formatNumber(line.campaigns, currency)}</td>
                      <td className={`${td} text-ink`}>{money(line.cost)}</td>
                      <td className={`${td} text-ink`}>{count(line.conversions)}</td>
                      <td className={`${td} text-ink-soft`}>
                        {line.conversions > 0 ? money(line.costPerConversion) : "—"}
                      </td>
                      <td className={`${td} text-ink-soft`}>{formatPercent(line.conversionRate)}</td>
                      <td className={`${td} text-ink-soft`}>{line.conversionValue > 0 ? money(line.conversionValue) : "—"}</td>
                      <td className={`${td} text-ink-soft`}>{line.roas > 0 ? `${line.roas.toFixed(2)}×` : "—"}</td>
                      <td className={td}>
                        <DeltaChip change={line.change} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollX>
        )}
      </Card>

      <SectionTitle>In detail</SectionTitle>

      <Card className="animate-rise">
        <CardHeader
          title="Conversion actions"
          description="Every action that recorded a result, as named in the Google Ads account."
        />
        {actions.length === 0 ? (
          <EmptyState
            title="Nothing recorded for this campaign type"
            description="Choose another campaign type or a longer period."
          />
        ) : (
          <ScrollX>
            <table className="w-full text-sm">
              <thead>
                <tr className={headRow}>
                  <th className={th}>Action</th>
                  <th className={th}>Campaign types</th>
                  <th className={`${th} text-right`}>Conversions</th>
                  <th className={`${th} text-right`}>Value</th>
                  <th className={`${th} text-right`}>vs before</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((action) => (
                  <tr key={action.key} className="border-b border-line transition last:border-0 hover:bg-surface-sunken">
                    <td className="max-w-[22rem] px-5 py-2.5 font-medium text-ink">
                      <span className="block truncate" title={action.action}>
                        {action.action}
                      </span>
                      <span
                        className="mt-0.5 block truncate text-xs font-normal text-ink-soft"
                        title={data.callRules[action.key]}
                      >
                        {action.label}
                        {/* A call action's rules say why it counts fewer than the Calls tab. */}
                        {data.callRules[action.key] ? ` · ${data.callRules[action.key]}` : ""}
                      </span>
                    </td>
                    <td className="max-w-[14rem] truncate px-5 py-2.5 text-ink-soft" title={action.channels.join(", ")}>
                      {action.channels.join(", ") || "—"}
                    </td>
                    <td className={`${td} text-ink`}>
                      {action.secondary ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink-soft">
                            Secondary
                          </span>
                          <span className="text-ink-soft">{count(action.allConversions)} recorded</span>
                        </span>
                      ) : (
                        count(action.conversions)
                      )}
                    </td>
                    <td className={`${td} text-ink-soft`}>{action.value > 0 ? money(action.value) : "—"}</td>
                    <td className={td}>
                      {action.secondary ? <span className="text-xs text-ink-faint">—</span> : <DeltaChip change={action.change} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        )}
      </Card>

      <Card className="animate-rise">
        <CardHeader title="Campaigns" description="What each campaign brought in, most conversions first." />
        {campaigns.length === 0 ? (
          <EmptyState
            title="Nothing recorded for this campaign type"
            description="Choose another campaign type or a longer period."
          />
        ) : (
          <ScrollX>
            <table className="w-full text-sm">
              <thead>
                <tr className={headRow}>
                  <th className={th}>Campaign</th>
                  <th className={th}>Results</th>
                  <th className={`${th} text-right`}>Conversions</th>
                  <th className={`${th} text-right`}>Value</th>
                  <th className={`${th} text-right`}>vs before</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => {
                  const results = campaign.categories
                    .map((c) => `${c.label} ${count(c.conversions)}`)
                    .join(" · ");
                  return (
                    <tr key={campaign.key} className="border-b border-line transition last:border-0 hover:bg-surface-sunken">
                      <td className="max-w-[18rem] px-5 py-2.5 font-medium text-ink">
                        <span className="block truncate" title={campaign.campaign}>
                          {campaign.campaign}
                        </span>
                        <span className="mt-0.5 block text-xs font-normal text-ink-soft">
                          {channelLabel(campaign.channel)}
                        </span>
                      </td>
                      <td className="max-w-[24rem] truncate px-5 py-2.5 text-ink-soft" title={results}>
                        {results || "Secondary actions only"}
                      </td>
                      <td className={`${td} text-ink`}>{count(campaign.conversions)}</td>
                      <td className={`${td} text-ink-soft`}>{campaign.value > 0 ? money(campaign.value) : "—"}</td>
                      <td className={td}>
                        <DeltaChip change={campaign.change} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollX>
        )}
      </Card>
    </div>
  );
}
