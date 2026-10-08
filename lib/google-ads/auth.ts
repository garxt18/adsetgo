import { supabaseAdmin } from "../supabase/admin.ts";
import {
  formatGoogleAdsCustomerId,
  normalizeGoogleAdsCustomerId,
} from "./format.ts";
import { TOP_KEYWORDS } from "./ads.ts";
import type { ResolvedRange } from "./date-range.ts";
import { forgetCached, reportCacheKey, withReportCache } from "./report-cache.ts";
import {
  buildSampleAds,
  buildSampleCalls,
  buildSampleKeywords,
  buildSampleRows,
  isSampleDataEnabled,
} from "./sample-data.ts";

/**
 * Every Google Ads call goes through this one version. Google sunsets old
 * versions (v18 and below now return 404), so it must never be duplicated
 * per call site: the copies drift and the stale one silently breaks.
 */
export const GOOGLE_ADS_API_VERSION =
  process.env.GOOGLE_ADS_API_VERSION || "v25";

// Google access tokens last an hour. Reusing one for 50 minutes means a
// report costs one call to Google rather than four round trips (read the
// refresh token, mint, record the status, then query), and it still leaves ten
// minutes' margin before Google would refuse it.
const ACCESS_TOKEN_TTL_MS = 50 * 60 * 1000;

const accessTokenKey = (agencyId: string) => reportCacheKey(["access-token", agencyId]);

/**
 * A Google Ads access token for one agency, minted from the refresh token that
 * agency stored when it connected.
 *
 * There is no platform-wide fallback token. One used to exist, and an agency
 * that had never connected silently borrowed it -- so an agency admin could
 * add any customer id that token could see and read that account's figures.
 */
export async function getGoogleAdsAccessToken(agencyId: string): Promise<string> {
  return withReportCache(accessTokenKey(agencyId), () => mintAccessToken(agencyId), ACCESS_TOKEN_TTL_MS);
}

/**
 * Stop using an agency's cached token. Called when the agency reconnects (the
 * new Google account may differ) and when Google refuses a request, so that
 * the next attempt mints afresh and a revoked connection is noticed and
 * marked expired instead of failing quietly until the cache runs out.
 */
export function forgetGoogleAdsAccessToken(agencyId: string): void {
  forgetCached(accessTokenKey(agencyId));
}

async function mintAccessToken(agencyId: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google Ads OAuth client credentials are not configured.");
  }

  const { data: agency } = await supabaseAdmin
    .from("agencies")
    .select("google_ads_refresh_token")
    .eq("id", agencyId)
    .maybeSingle();

  const refreshToken = (agency as { google_ads_refresh_token?: string | null } | null)
    ?.google_ads_refresh_token;

  if (!refreshToken) {
    throw new Error("This agency has not connected Google Ads yet.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const tokenData = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !tokenData.access_token) {
    // Google rejects a revoked or expired refresh token with invalid_grant.
    // Record that on the agency, otherwise the dashboard keeps claiming the
    // connection is healthy while every request fails and nothing prompts the
    // agency to reconnect.
    if (tokenData.error === "invalid_grant") {
      await supabaseAdmin
        .from("agencies")
        .update({ google_ads_connection_status: "expired" })
        .eq("id", agencyId);
    }

    throw new Error(
      tokenData.error_description ??
        tokenData.error ??
        "Failed to mint Google OAuth access token."
    );
  }

  // A previously expired connection that works again should stop nagging.
  await supabaseAdmin
    .from("agencies")
    .update({ google_ads_connection_status: "connected" })
    .eq("id", agencyId)
    .eq("google_ads_connection_status", "expired");

  return tokenData.access_token;
}

export type FullGoogleAdsAccount = {
  customerId: string;
  formattedCustomerId: string;
  name: string;
  status: string; // "ENABLED" | "CANCELED" | "SUSPENDED" | "CLOSED" | ...
  hidden: boolean;
  manager: boolean;
  testAccount: boolean;
  currencyCode?: string | null;
  timeZone?: string | null;
  managerCustomerId?: string | null;
};

/**
 * One row of a Google Ads campaign report, spelled the way the REST API sends
 * it. The query names fields in snake_case (metrics.cost_micros) but the JSON
 * reply is camelCase (metrics.costMicros). Reading the query's spelling from
 * the reply found nothing, so every rupee of real spend came through as 0 --
 * and sample data, written in the same wrong spelling, hid it.
 */
export type GoogleAdsRow = {
  campaign?: {
    id?: string | number;
    name?: string;
    status?: string;
  };
  metrics?: {
    impressions?: number | string;
    clicks?: number | string;
    costMicros?: number | string;
    conversions?: number | string;
    conversionsValue?: number | string;
  };
  segments?: {
    date?: string;
  };
};

/** One call from call_view, spelled as the REST API sends it (camelCase). */
export type CallRow = {
  campaign?: { id?: string | number; name?: string };
  callView?: {
    /** "2026-09-18 14:03:21", in the account's own time zone. */
    startCallDateTime?: string;
    /** "RECEIVED" or "MISSED". */
    callStatus?: string;
    callDurationSeconds?: number | string;
    /** "AD" when dialled from the ad, "LANDING_PAGE" when from the website. */
    callTrackingDisplayLocation?: string;
  };
};

/** Totals for one ad or keyword over a whole period (no date segment). */
type PeriodMetrics = {
  impressions?: number | string;
  clicks?: number | string;
  costMicros?: number | string;
  conversions?: number | string;
};

type AdText = { text?: string; pinnedField?: string };

/** One ad from ad_group_ad, with the campaign and ad group it runs in. */
export type AdRow = {
  campaign?: { id?: string | number; name?: string };
  adGroup?: { id?: string | number; name?: string };
  adGroupAd?: {
    status?: string;
    ad?: {
      id?: string | number;
      name?: string;
      type?: string;
      responsiveSearchAd?: { headlines?: AdText[] };
      responsiveDisplayAd?: { headlines?: AdText[] };
      expandedTextAd?: { headlinePart1?: string; headlinePart2?: string };
    };
  };
  metrics?: PeriodMetrics;
};

/** One keyword from keyword_view, with the campaign and ad group it bids in. */
export type KeywordRow = {
  campaign?: { id?: string | number; name?: string };
  adGroup?: { id?: string | number; name?: string };
  adGroupCriterion?: {
    criterionId?: string | number;
    status?: string;
    keyword?: { text?: string; matchType?: string };
  };
  metrics?: PeriodMetrics;
};

/**
 * Headers for every Google Ads API call. `login-customer-id` names the manager
 * account a request acts through; without it Google only answers for accounts
 * the signed-in Google user owns directly.
 */
function googleAdsHeaders(accessToken: string, loginCustomerId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    "Content-Type": "application/json",
    ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
  };
}

/** googleAds:search returns one object; googleAds:searchStream an array of chunks. */
type GoogleAdsSearchChunk<T> = {
  results?: T[];
  error?: { message?: string };
};

type GoogleAdsSearchPayload<T> = GoogleAdsSearchChunk<T> | GoogleAdsSearchChunk<T>[];

const ACCOUNT_TREE_QUERY = `
  SELECT
    customer_client.client_customer,
    customer_client.id,
    customer_client.descriptive_name,
    customer_client.status,
    customer_client.hidden,
    customer_client.manager,
    customer_client.test_account,
    customer_client.currency_code,
    customer_client.time_zone,
    customer_client.level
  FROM customer_client
`;

/**
 * Every account under one root the token can see (the root included), read
 * from its customer_client hierarchy: active, cancelled, closed and hidden
 * accounts, and managers. A root that fails is logged and contributes nothing,
 * so one inaccessible account does not hide the rest.
 */
async function fetchAccountsUnder(rootId: string, accessToken: string): Promise<FullGoogleAdsAccount[]> {
  try {
    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${rootId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: googleAdsHeaders(accessToken, rootId),
        body: JSON.stringify({ query: ACCOUNT_TREE_QUERY }),
      }
    );

    if (!response.ok) {
      console.warn(`Hierarchy search failed for ${rootId}: status ${response.status}`);
      return [];
    }

    const payload = await response.json();
    const chunks = Array.isArray(payload) ? payload : [payload];
    const rows = chunks.flatMap((chunk: { results?: Array<Record<string, unknown>> }) => chunk.results ?? []);

    return rows.flatMap((entry) => {
      const client = (entry.customerClient ?? entry.customer_client ?? entry) as Record<string, unknown>;
      const rawId = String(client.id ?? client.customerId ?? client.customer_id ?? "");
      if (!rawId) return [];

      const formatted = formatGoogleAdsCustomerId(rawId);
      const descriptiveName = client.descriptiveName ?? client.descriptive_name;

      return [
        {
          customerId: rawId,
          formattedCustomerId: formatted,
          name: String(descriptiveName || (client.manager ? "Manager Account" : `Account ${formatted}`)),
          status: String(client.status ?? "ENABLED"),
          hidden: Boolean(client.hidden),
          manager: Boolean(client.manager),
          testAccount: Boolean(client.testAccount ?? client.test_account),
          currencyCode: (client.currencyCode ?? client.currency_code) as string | null | undefined,
          timeZone: (client.timeZone ?? client.time_zone) as string | null | undefined,
          managerCustomerId: rawId === rootId ? null : rootId,
        },
      ];
    });
  } catch (error) {
    console.warn(`Failed querying customer_client hierarchy for ${rootId}:`, error);
    return [];
  }
}

export async function fetchAllGoogleAdsAccounts({
  accessToken,
  managerCustomerId,
}: {
  accessToken: string;
  managerCustomerId?: string | null;
}): Promise<FullGoogleAdsAccount[]> {
  let rootIds: string[] = [];
  try {
    rootIds = await fetchAccessibleGoogleAdsCustomers({ accessToken });
  } catch (err) {
    console.warn("fetchAccessibleGoogleAdsCustomers failed:", err);
  }

  const cleanedManagerId = normalizeGoogleAdsCustomerId(managerCustomerId);
  if (cleanedManagerId && !rootIds.includes(cleanedManagerId)) {
    rootIds.push(cleanedManagerId);
  }

  const roots = rootIds.map((id) => normalizeGoogleAdsCustomerId(id)).filter(Boolean);

  // All roots at once: they are independent, and asking one after another
  // made the Google Ads view wait for the sum of every round trip. Merged in
  // root order afterwards, so an account seen under two roots resolves the
  // same way it did when they were read in sequence.
  const trees = await Promise.all(roots.map((rootId) => fetchAccountsUnder(rootId, accessToken)));
  const accountMap = new Map<string, FullGoogleAdsAccount>();
  for (const account of trees.flat()) accountMap.set(account.customerId, account);

  // Nothing readable from any hierarchy: list the roots themselves, so the
  // agency at least sees which accounts its Google login reaches.
  if (accountMap.size === 0) {
    for (const rawId of roots) {
      accountMap.set(rawId, {
        customerId: rawId,
        formattedCustomerId: formatGoogleAdsCustomerId(rawId),
        name: `Google Ads Account (${formatGoogleAdsCustomerId(rawId)})`,
        status: "ENABLED",
        hidden: false,
        manager: false,
        testAccount: false,
        currencyCode: null,
        timeZone: null,
        managerCustomerId: null,
      });
    }
  }

  return Array.from(accountMap.values());
}

/** One GAQL query against one account: every row of every chunk. */
async function searchStream<T>(
  customerId: string,
  managerCustomerId: string,
  query: string,
  accessToken: string
): Promise<T[]> {
  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: googleAdsHeaders(accessToken, managerCustomerId),
      body: JSON.stringify({ query }),
    }
  );

  const rawText = await response.text();
  let payload: GoogleAdsSearchPayload<T> | null = null;

  try {
    payload = rawText ? (JSON.parse(rawText) as GoogleAdsSearchPayload<T>) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = Array.isArray(payload) ? payload[0]?.error?.message : payload?.error?.message;
    throw new Error(message ?? `Google Ads API request failed (${response.status}).`);
  }

  // searchStream replies with an array of chunks; search replies with one object.
  if (Array.isArray(payload)) {
    return payload.flatMap((chunk) => chunk.results ?? []);
  }

  return payload?.results ?? [];
}

type WindowRequest = {
  agencyId: string;
  customerId: string;
  /** May be empty: an account the connected Google user owns directly needs none. */
  managerCustomerId: string;
  range: ResolvedRange;
};

/**
 * One kind of report for one account, for the chosen period and the one before
 * it, fetched together so a comparison always matches the period on screen.
 *
 * Each window is cached, and the access token is only asked for on a cache
 * miss. In sample mode nothing reaches Google at all: no token, no quota.
 */
function fetchWindows<T>(
  request: WindowRequest,
  kind: string,
  query: (start: string, end: string) => string,
  sample: (start: string, end: string) => T[]
): Promise<[T[], T[]]> {
  const { range } = request;
  return Promise.all([
    fetchWindow(request, kind, query, sample, range.start, range.end),
    fetchWindow(request, kind, query, sample, range.previousStart, range.previousEnd),
  ]);
}

/** One window of one kind of report: cached, or generated in sample mode. */
function fetchWindow<T>(
  { agencyId, customerId, managerCustomerId }: WindowRequest,
  kind: string,
  query: (start: string, end: string) => string,
  sample: (start: string, end: string) => T[],
  start: string,
  end: string
): Promise<T[]> {
  if (isSampleDataEnabled()) return Promise.resolve(sample(start, end));

  return withReportCache(reportCacheKey([kind, customerId, managerCustomerId, start, end]), async () =>
    searchStream<T>(customerId, managerCustomerId, query(start, end), await getGoogleAdsAccessToken(agencyId))
  );
}

/** Campaign rows, one per campaign per day, behind a client's report. */
export function fetchReportRows(request: WindowRequest) {
  return fetchWindows<GoogleAdsRow>(
    request,
    "campaigns",
    (start, end) => `
      SELECT
        segments.date,
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${start}' AND '${end}'
      ORDER BY segments.date ASC
    `,
    (startDate, endDate) => buildSampleRows({ customerId: request.customerId, startDate, endDate })
  );
}

/**
 * Every call that came through the client's ads, one row per call.
 *
 * Google only knows about calls to its own forwarding numbers -- call assets,
 * call-only ads, and website numbers with call reporting on -- so calls from
 * other channels never appear here. It also hides callers' numbers, which is
 * why there is no "first-time caller" figure.
 */
/** How long an account's currency is remembered: it is set when the account is made. */
const CURRENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The account's own currency (customer.currency_code), so a UK client's
 * figures read in pounds. Google states figures in the account's currency;
 * labelling them in another was the bug this fixes. Remembered for a day, so
 * it costs about one operation per account per day. Sample figures are made up
 * in rupees, so sample mode answers INR without asking Google.
 */
export async function fetchAccountCurrency({
  agencyId,
  customerId,
  managerCustomerId,
}: Omit<WindowRequest, "range">): Promise<string> {
  if (isSampleDataEnabled()) return "INR";

  return withReportCache(
    reportCacheKey(["currency", customerId, managerCustomerId]),
    async () => {
      const [row] = await searchStream<{ customer?: { currencyCode?: string } }>(
        customerId,
        managerCustomerId,
        "SELECT customer.currency_code FROM customer",
        await getGoogleAdsAccessToken(agencyId)
      );
      const code = row?.customer?.currencyCode ?? "";
      // ISO 4217 codes only; anything else would make every figure unreadable.
      if (!/^[A-Z]{3}$/.test(code)) throw new Error(`Google Ads returned no currency for ${customerId}.`);
      return code;
    },
    CURRENCY_TTL_MS
  );
}

export function fetchCallRows(request: WindowRequest) {
  return fetchWindows<CallRow>(
    request,
    "calls",
    (start, end) => `
      SELECT
        call_view.start_call_date_time,
        call_view.call_status,
        call_view.call_duration_seconds,
        call_view.call_tracking_display_location,
        campaign.id,
        campaign.name
      FROM call_view
      WHERE call_view.start_call_date_time BETWEEN '${start} 00:00:00' AND '${end} 23:59:59'
    `,
    (startDate, endDate) => buildSampleCalls({ customerId: request.customerId, startDate, endDate })
  );
}

/**
 * Every ad that was shown in the period, with its totals for the whole period.
 * The current period only: the Ads tab ranks ads rather than comparing them,
 * so the window before would cost a query and show nowhere.
 *
 * Performance Max has no ads of its own here (it builds them from asset
 * groups), so its campaigns appear in the report but not in this list.
 */
export function fetchAdRows(request: WindowRequest) {
  const { range } = request;
  return fetchWindow<AdRow>(
    request,
    "ads",
    (start, end) => `
      SELECT
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        ad_group_ad.ad.type,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_display_ad.headlines,
        ad_group_ad.ad.expanded_text_ad.headline_part1,
        ad_group_ad.ad.expanded_text_ad.headline_part2,
        ad_group_ad.status,
        ad_group.id,
        ad_group.name,
        campaign.id,
        campaign.name,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM ad_group_ad
      WHERE segments.date BETWEEN '${start}' AND '${end}' AND metrics.impressions > 0
    `,
    (startDate, endDate) => buildSampleAds({ customerId: request.customerId, startDate, endDate }),
    range.start,
    range.end
  );
}

/**
 * The period's best keywords: most conversions, then most clicks. Google
 * sorts and trims them, so an account bidding on thousands of keywords still
 * sends only these.
 */
export function fetchKeywordRows(request: WindowRequest) {
  const { range } = request;
  return fetchWindow<KeywordRow>(
    request,
    "keywords",
    (start, end) => `
      SELECT
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        ad_group.id,
        ad_group.name,
        campaign.id,
        campaign.name,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM keyword_view
      WHERE segments.date BETWEEN '${start}' AND '${end}' AND metrics.impressions > 0
      ORDER BY metrics.conversions DESC, metrics.clicks DESC
      LIMIT ${TOP_KEYWORDS}
    `,
    (startDate, endDate) => buildSampleKeywords({ customerId: request.customerId, startDate, endDate }),
    range.start,
    range.end
  );
}

export async function fetchAccessibleGoogleAdsCustomers({
  accessToken,
}: {
  accessToken: string;
}): Promise<string[]> {
  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
    {
      method: "GET",
      headers: googleAdsHeaders(accessToken),
    }
  );

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Google Ads listAccessibleCustomers failed (${response.status}): ${responseText}`
    );
  }

  const data = (JSON.parse(responseText) as { resourceNames?: string[] }) ?? {};
  return (data.resourceNames ?? []).map((res) => res.replace(/^customers\//, ""));
}
