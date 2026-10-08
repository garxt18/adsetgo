"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DeltaChip, Sparkline, type Point } from "@/components/charts";
import { StatusPill } from "@/components/ui/status-pill";
import { ScrollX } from "@/components/ui/scroll-x";
import { formatCurrency, formatNumber } from "@/lib/format";
import { formatGoogleAdsCustomerId } from "@/lib/google-ads/format";

export type ClientRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  googleAdsCustomerId: string | null;
  metrics: {
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    costPerConversion: number;
  } | null;
  change: number | null;
  conversionChange: number | null;
  spendSeries: Point[];
  /** The account's currency; null when there are no figures. */
  currency: string | null;
};

type SortKey = "cost" | "conversions" | "clicks" | "name";

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: "cost", label: "Ad spend" },
  { value: "conversions", label: "Conversions" },
  { value: "clicks", label: "Clicks" },
  { value: "name", label: "Name" },
];

/** Initials avatar, tinted from the name so a row is recognisable at a glance. */
function Avatar({ name }: { name: string }) {
  const hue = Array.from(name).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;

  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
      style={{
        // Tint only: the text colour stays fixed so contrast does not depend
        // on which letters a client's name happens to start with.
        backgroundColor: `oklch(0.92 0.05 ${hue})`,
        color: "#0b1220",
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ClientTable({
  clients,
  slug,
  onInvite,
}: {
  clients: ClientRow[];
  slug: string;
  onInvite: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("cost");

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    // Ids are stored as ten digits, so "358-312" is matched on its digits.
    const digits = term.replace(/\D/g, "");
    const filtered = term
      ? clients.filter(
          (client) =>
            client.name.toLowerCase().includes(term) ||
            client.email.toLowerCase().includes(term) ||
            (digits !== "" && (client.googleAdsCustomerId ?? "").includes(digits))
        )
      : clients;

    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      const left = a.metrics?.[sort] ?? 0;
      const right = b.metrics?.[sort] ?? 0;
      return right - left;
    });
  }, [clients, query, sort]);

  return (
    <section className="animate-rise rounded-2xl bg-surface ring-1 ring-line">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-medium tracking-[-0.01em] text-ink">Clients</h2>
          <span className="tabular rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink-soft">
            {clients.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Search clients</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients"
              className="w-44 rounded-xl bg-surface-sunken px-3 py-1.5 text-sm text-ink ring-1 ring-line transition placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs text-ink-soft">
            <span className="hidden sm:inline">Sorted by</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-xl bg-surface-sunken px-2.5 py-1.5 text-sm text-ink ring-1 ring-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={onInvite}
            className="rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            + Add client
          </button>
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm font-medium text-ink">
            {clients.length === 0 ? "No clients yet" : "No clients match that search"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
            {clients.length === 0
              ? "Add a client with their Google Ads account, and we will send them a private link to their own report."
              : "Try a different name, email or account number."}
          </p>
        </div>
      ) : (
        <ScrollX>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-[0.1em] text-ink-faint">
                <th className="px-5 py-2.5">Client</th>
                <th className="px-5 py-2.5">Status</th>
                <th className="px-5 py-2.5 text-right">Ad spend</th>
                <th className="px-5 py-2.5 text-right">Conversions</th>
                <th className="px-5 py-2.5 text-right">Clicks</th>
                <th className="px-5 py-2.5">Spend trend</th>
                <th className="px-5 py-2.5 text-right">Cost / conv.</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((client) => (
                <tr
                  key={client.id}
                  className="group border-b border-line transition last:border-0 hover:bg-surface-sunken"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/agencies/${slug}/clients/${client.id}`}
                      className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <Avatar name={client.name} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink group-hover:text-brand">
                          {client.name}
                        </span>
                        <span className="block truncate text-xs text-ink-faint">
                          {client.googleAdsCustomerId
                            ? formatGoogleAdsCustomerId(client.googleAdsCustomerId)
                            : "No account linked"}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <StatusPill status={client.status} />
                  </td>
                  <td className="tabular px-5 py-3 text-right font-medium text-ink">
                    {client.metrics ? formatCurrency(client.metrics.cost, client.currency ?? undefined) : "—"}
                  </td>
                  <td className="tabular px-5 py-3 text-right text-ink">
                    {client.metrics ? formatNumber(client.metrics.conversions, client.currency ?? undefined) : "—"}
                  </td>
                  <td className="tabular px-5 py-3 text-right text-ink-soft">
                    {client.metrics ? formatNumber(client.metrics.clicks, client.currency ?? undefined) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-20">
                        <Sparkline points={client.spendSeries} height={24} />
                      </span>
                      {/* Spend, reported without a verdict: see DeltaChip. */}
                      <DeltaChip change={client.change} neutral />
                    </div>
                  </td>
                  <td className="tabular px-5 py-3 text-right text-ink">
                    {client.metrics && client.metrics.conversions > 0
                      ? formatCurrency(client.metrics.costPerConversion, client.currency ?? undefined)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
      )}
    </section>
  );
}
