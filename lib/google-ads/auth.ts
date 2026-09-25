import { supabaseAdmin } from "../supabase/admin.ts";
import {
  formatGoogleAdsCustomerId,
  normalizeGoogleAdsCustomerId,
} from "./format.ts";
import type { ResolvedRange } from "./date-range.ts";
import { forgetCached, reportCacheKey, withReportCache } from "./report-cache.ts";
import { buildSampleRows, isSampleDataEnabled } from "./sample-data.ts";

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

/** One row of a Google Ads campaign report. */
export type GoogleAdsRow = {
  campaign?: {
    id?: string | number;
    name?: string;
    status?: string;
  };
  metrics?: {
    impressions?: number | string;
    clicks?: number | string;
    cost_micros?: number | string;
    conversions?: number | string;
    conversions_value?: number | string;
    ctr?: number | string;
    average_cpc?: number | string;
    average_cpm?: number | string;
  };
  segments?: {
    date?: string;
  };
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
type GoogleAdsSearchChunk = {
  results?: GoogleAdsRow[];
  error?: { message?: string };
};

type GoogleAdsSearchPayload = GoogleAdsSearchChunk | GoogleAdsSearchChunk[];

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

/**
 * Fetch campaign metrics for one client account.
 *
 * `managerCustomerId` is optional: an agency that has not recorded its MCC id
 * can still read an account the connected Google user owns directly.
 */
export async function fetchGoogleAdsMetrics({
  clientCustomerId,
  managerCustomerId,
  startDate,
  endDate,
  accessToken,
}: {
  clientCustomerId: string;
  managerCustomerId?: string | null;
  /** Inclusive YYYY-MM-DD bounds; see lib/google-ads/date-range.ts. */
  startDate: string;
  endDate: string;
  accessToken: string;
}): Promise<GoogleAdsRow[]> {
  const cleanedCustomerId = normalizeGoogleAdsCustomerId(clientCustomerId);
  const cleanedManagerId = normalizeGoogleAdsCustomerId(managerCustomerId);

  if (!cleanedCustomerId) {
    throw new Error("Google Ads customer ID is required.");
  }
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanedCustomerId}/googleAds:searchStream`;
  const query = `
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' 
    ORDER BY segments.date ASC
  `;

  const response = await fetch(url, {
    method: "POST",
    headers: googleAdsHeaders(accessToken, cleanedManagerId),
    body: JSON.stringify({ query }),
  });

  const rawText = await response.text();
  let payload: GoogleAdsSearchPayload | null = null;

  try {
    payload = rawText ? (JSON.parse(rawText) as GoogleAdsSearchPayload) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = Array.isArray(payload)
      ? payload[0]?.error?.message
      : payload?.error?.message;

    throw new Error(
      message ?? `Google Ads API request failed (${response.status}).`
    );
  }

  // searchStream replies with an array of chunks; search replies with one object.
  if (Array.isArray(payload)) {
    return payload.flatMap((chunk) => chunk.results ?? []);
  }

  return payload?.results ?? [];
}

/**
 * The rows behind one account's report: the chosen period and the one before
 * it, fetched together so the comparison always matches the period on screen.
 *
 * Each window is cached, and the access token is only asked for on a cache
 * miss. In sample mode nothing reaches Google at all: no token, no quota.
 */
export async function fetchReportRows({
  agencyId,
  customerId,
  managerCustomerId,
  range,
}: {
  agencyId: string;
  customerId: string;
  managerCustomerId: string;
  range: ResolvedRange;
}): Promise<[GoogleAdsRow[], GoogleAdsRow[]]> {
  const sample = isSampleDataEnabled();

  const load = (startDate: string, endDate: string) =>
    sample
      ? Promise.resolve(buildSampleRows({ customerId, startDate, endDate }))
      : withReportCache(reportCacheKey([customerId, managerCustomerId, startDate, endDate]), async () =>
          fetchGoogleAdsMetrics({
            clientCustomerId: customerId,
            managerCustomerId,
            startDate,
            endDate,
            accessToken: await getGoogleAdsAccessToken(agencyId),
          })
        );

  return Promise.all([load(range.start, range.end), load(range.previousStart, range.previousEnd)]);
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
