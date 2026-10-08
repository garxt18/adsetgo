import type { Agency } from "./agencies.ts";
import {
  fetchAccountCurrency,
  fetchReportRows,
  forgetGoogleAdsAccessToken,
  getGoogleAdsAccessToken,
} from "./google-ads/auth.ts";
import { normalizeGoogleAdsCustomerId } from "./google-ads/format.ts";
import { percentChange, periodOf, type ResolvedRange } from "./google-ads/date-range.ts";
import { groupByDay, summarize, totalsByCurrency } from "./google-ads/report.ts";
import { isSampleDataEnabled } from "./google-ads/sample-data.ts";
import { supabaseAdmin } from "./supabase/admin.ts";

/**
 * One row per client for the agency's list and its PDF report, with the figures that decide where
 * attention goes: spend, clicks, conversions and the direction of travel.
 *
 * Google reports metrics per customer, so a list of N clients costs N queries
 * per window. Three things keep that affordable against an Explorer token's
 * 2,880 operations a day: results are cached per customer and window, the two
 * windows for one client are fetched together, and clients are processed in
 * small batches rather than all at once so a large agency cannot open a
 * hundred sockets at a time.
 */

const BATCH_SIZE = 5;

type ClientRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  google_ads_customer_id: string | null;
};

/**
 * The agency's clients with their figures for a period. Server only, and the
 * caller must already have checked access (requireAgency).
 */
export async function buildAgencyOverview(agency: Agency, range: ResolvedRange) {
  const agencyId = agency.id;

  const { data: clientRows } = await supabaseAdmin
    .from("clients")
    .select("id, name, email, status, google_ads_customer_id")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });

  const clients = (clientRows ?? []) as ClientRow[];
  const useSample = isSampleDataEnabled();
  const managerCustomerId = normalizeGoogleAdsCustomerId(agency.google_ads_manager_customer_id);

  // Asked once up front, so a broken connection is reported as one banner
  // rather than as every client quietly showing no figures. The token is
  // cached, so the per-client loads below reuse it.
  let connectionError: string | null = null;

  if (!useSample && clients.length > 0) {
    try {
      await getGoogleAdsAccessToken(agencyId);
    } catch (error) {
      connectionError = error instanceof Error ? error.message : "Google Ads is unavailable.";
    }
  }

  async function loadClient(client: ClientRow) {
    const customerId = normalizeGoogleAdsCustomerId(client.google_ads_customer_id);
    const empty = { client, current: null, previous: null, spendSeries: [], currency: null };

    if (!customerId || connectionError) return empty;

    try {
      const query = { agencyId, customerId, managerCustomerId, range };
      const [[rows, previousRows], currency] = await Promise.all([
        fetchReportRows(query),
        fetchAccountCurrency(query),
      ]);

      // Only what the client list shows; the full report is a click away.
      const { impressions, clicks, cost, conversions, costPerConversion } = summarize(rows);
      const previous = summarize(previousRows);

      return {
        client,
        current: { impressions, clicks, cost, conversions, costPerConversion },
        previous,
        spendSeries: groupByDay(rows, range.start, range.end).map((day) => ({ label: day.date, value: day.cost })),
        currency,
      };
    } catch {
      // One client's account failing must not blank the whole agency's list.
      // The token is dropped in case Google refused it, so the next load
      // mints a new one and notices a revoked connection.
      forgetGoogleAdsAccessToken(agencyId);
      return empty;
    }
  }

  const results: Array<Awaited<ReturnType<typeof loadClient>>> = [];

  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE);
    results.push(...(await Promise.all(batch.map(loadClient))));
  }

  const rows = results.map(({ client, current, previous, spendSeries, currency }) => ({
    id: client.id,
    name: client.name,
    email: client.email,
    status: client.status,
    googleAdsCustomerId: client.google_ads_customer_id,
    metrics: current,
    change: current && previous ? percentChange(current.cost, previous.cost) : null,
    conversionChange:
      current && previous ? percentChange(current.conversions, previous.conversions) : null,
    spendSeries,
    /** The account's currency; null when there are no figures to show. */
    currency,
  }));

  // Counts add up across clients; money only within one currency.
  const withFigures = rows.filter((row) => row.metrics && row.currency);
  const sum = (pick: (m: NonNullable<(typeof rows)[number]["metrics"]>) => number) =>
    withFigures.reduce((total, row) => total + pick(row.metrics!), 0);
  const totals = {
    clicks: sum((m) => m.clicks),
    conversions: sum((m) => m.conversions),
    impressions: sum((m) => m.impressions),
    spend: totalsByCurrency(
      withFigures.map((row) => ({
        currency: row.currency!,
        cost: row.metrics!.cost,
        conversions: row.metrics!.conversions,
      }))
    ),
  };

  return {
    agency: {
      id: agency.id,
      name: agency.name,
      slug: agency.slug,
      connectionStatus: agency.google_ads_connection_status,
      managerCustomerId: agency.google_ads_manager_customer_id,
    },
    period: periodOf(range),
    clients: rows,
    totals,
    connectionError,
    isSample: useSample,
  };
}

export type AgencyOverview = Awaited<ReturnType<typeof buildAgencyOverview>>;
