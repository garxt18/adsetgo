import { supabaseAdmin } from "../supabase-admin.ts";

export type GoogleAdsRole = "master_admin" | "agency_admin" | "client";

export function normalizeGoogleAdsCustomerId(value?: string | null): string {
  if (!value) {
    return "";
  }

  return value.replace(/[^\d]/g, "");
}

export function sanitizeAgencySlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function getGoogleAdsAccessToken(options?: {
  agencyId?: string;
  refreshToken?: string;
}): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google Ads OAuth client credentials are not configured.");
  }

  // Prefer explicit refreshToken passed in, then per-agency stored token, then global env var
  let refreshToken = options?.refreshToken ?? null;

  // Look up per-agency stored token from the database
  if (!refreshToken && options?.agencyId) {
    const { data: agency } = await supabaseAdmin
      .from("agencies")
      .select("google_ads_refresh_token")
      .eq("id", options.agencyId)
      .maybeSingle();

    const agencyData = agency as { google_ads_refresh_token?: string | null } | null;
    refreshToken = agencyData?.google_ads_refresh_token ?? null;
  }

  // Fall back to global env var only if no agency-specific token
  if (!refreshToken) {
    refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN ?? null;
  }

  if (!refreshToken) {
    throw new Error(
      "Google Ads refresh token is not configured for this agency or globally."
    );
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
    throw new Error(
      tokenData.error_description ??
        tokenData.error ??
        "Failed to mint Google OAuth access token."
    );
  }

  return tokenData.access_token;
}

export function formatGoogleAdsCustomerId(value?: string | null): string {
  const digits = normalizeGoogleAdsCustomerId(value);
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits || "N/A";
}

export type GoogleAdsManagedAccount = {
  customerId: string;
  formattedCustomerId?: string;
  name: string;
  status: string;
  hidden?: boolean;
  manager?: boolean;
  testAccount?: boolean;
  currencyCode?: string | null;
  timeZone?: string | null;
};

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

export type GoogleAdsMetricsResult = {
  results?: Array<{
    campaign?: {
      id?: string;
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
  }>;
  error?: {
    message?: string;
  };
};

export async function fetchGoogleAdsManagedAccounts({
  managerCustomerId,
  accessToken,
}: {
  managerCustomerId: string;
  accessToken: string;
}): Promise<GoogleAdsManagedAccount[]> {
  const cleanedManagerId = normalizeGoogleAdsCustomerId(managerCustomerId);

  if (!cleanedManagerId) {
    throw new Error("Google Ads manager customer ID is required.");
  }

  const apiVersion = process.env.GOOGLE_ADS_API_VERSION || "v18";
  const response = await fetch(
    `https://googleads.googleapis.com/${apiVersion}/customers/${cleanedManagerId}/googleAds:search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
        "login-customer-id": cleanedManagerId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
          SELECT
            customer_client.client_customer,
            customer_client.id,
            customer_client.descriptive_name,
            customer_client.status,
            customer_client.hidden,
            customer_client.manager,
            customer_client.test_account,
            customer_client.currency_code,
            customer_client.time_zone
          FROM customer_client
        `,
      }),
    }
  );

  const responseText = await response.text();
  type GoogleAdsCustomerClientSearchPayload = {
    results?: Array<{ customerClient?: Record<string, unknown> } | Record<string, unknown>>;
    error?: { message?: string };
  };

  let payload: GoogleAdsCustomerClientSearchPayload | null = null;

  try {
    payload = responseText ? (JSON.parse(responseText) as GoogleAdsCustomerClientSearchPayload) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ??
      (responseText || "Google Ads account listing request failed.");
    throw new Error(message);
  }

  const results: Array<{ customerClient?: Record<string, unknown> } | Record<string, unknown>> = Array.isArray(payload?.results)
    ? payload.results
    : [];

  return results
    .map((entry) => {
      if (entry && typeof entry === "object" && "customerClient" in entry && entry.customerClient) {
        return entry.customerClient as Record<string, unknown>;
      }
      return entry as Record<string, unknown>;
    })
    .filter((client): client is Record<string, unknown> => !!client)
    .map((client) => {
      const rawId = String(client.id ?? client.customerId ?? client.customer_id ?? "");
      return {
        customerId: rawId,
        formattedCustomerId: formatGoogleAdsCustomerId(rawId),
        name: String(client.descriptiveName ?? client.descriptive_name ?? `Account ${formatGoogleAdsCustomerId(rawId)}`),
        status: String(client.status ?? "ENABLED"),
        hidden: Boolean(client.hidden),
        manager: Boolean(client.manager),
        testAccount: Boolean(client.testAccount ?? client.test_account),
        currencyCode: (client.currencyCode ?? client.currency_code) as string | null | undefined,
        timeZone: (client.timeZone ?? client.time_zone) as string | null | undefined,
      };
    })
    .filter((account) => Boolean(account.customerId));
}

export async function fetchAllGoogleAdsAccounts({
  accessToken,
  managerCustomerId,
}: {
  accessToken: string;
  managerCustomerId?: string | null;
}): Promise<FullGoogleAdsAccount[]> {
  const accountMap = new Map<string, FullGoogleAdsAccount>();
  const apiVersion = process.env.GOOGLE_ADS_API_VERSION || "v25";
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "";

  // 1. Fetch all root accessible customers
  let accessibleCustomerIds: string[] = [];
  try {
    accessibleCustomerIds = await fetchAccessibleGoogleAdsCustomers({ accessToken });
  } catch (err) {
    console.warn("fetchAccessibleGoogleAdsCustomers failed:", err);
  }

  const cleanedManagerId = normalizeGoogleAdsCustomerId(managerCustomerId);
  if (cleanedManagerId && !accessibleCustomerIds.includes(cleanedManagerId)) {
    accessibleCustomerIds.push(cleanedManagerId);
  }

  // 2. For each accessible customer (or manager), query customer_client hierarchy
  for (const customerId of accessibleCustomerIds) {
    const cleanId = normalizeGoogleAdsCustomerId(customerId);
    if (!cleanId) continue;

    // Query customer_client hierarchy via searchStream (fetches all root + child accounts: active, canceled, closed, hidden, managers)
    try {
      const hierResp = await fetch(
        `https://googleads.googleapis.com/${apiVersion}/customers/${cleanId}/googleAds:searchStream`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "developer-token": devToken,
            "login-customer-id": cleanId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: `
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
            `,
          }),
        }
      );

      if (hierResp.ok) {
        const hierData = await hierResp.json();
        const batches = Array.isArray(hierData) ? hierData : [hierData];
        const rows = batches.flatMap((b: { results?: Array<Record<string, unknown>> }) => b.results ?? []);

        for (const entry of rows) {
          const client = (entry.customerClient ?? entry.customer_client ?? entry) as Record<string, unknown>;
          const rawId = String(client.id ?? client.customerId ?? client.customer_id ?? "");
          if (!rawId) continue;

          const rawStatus = String(client.status ?? "ENABLED");
          const descriptiveName = client.descriptiveName ?? client.descriptive_name;

          accountMap.set(rawId, {
            customerId: rawId,
            formattedCustomerId: formatGoogleAdsCustomerId(rawId),
            name: String(descriptiveName || (client.manager ? "Manager Account" : `Account ${formatGoogleAdsCustomerId(rawId)}`)),
            status: rawStatus,
            hidden: Boolean(client.hidden),
            manager: Boolean(client.manager),
            testAccount: Boolean(client.testAccount ?? client.test_account),
            currencyCode: (client.currencyCode ?? client.currency_code) as string | null | undefined,
            timeZone: (client.timeZone ?? client.time_zone) as string | null | undefined,
            managerCustomerId: rawId === cleanId ? null : cleanId,
          });
        }
      } else {
        console.warn(`Hierarchy search failed for ${cleanId}: status ${hierResp.status}`);
      }
    } catch (e) {
      console.warn(`Failed querying customer_client hierarchy for ${cleanId}:`, e);
    }
  }

  // Fallback: if accountMap is empty but we have accessibleCustomerIds, populate them
  if (accountMap.size === 0 && accessibleCustomerIds.length > 0) {
    for (const id of accessibleCustomerIds) {
      const rawId = normalizeGoogleAdsCustomerId(id);
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

export async function fetchGoogleAdsMetrics({
  clientCustomerId,
  managerCustomerId,
  dateRange,
  accessToken,
}: {
  clientCustomerId: string;
  managerCustomerId: string;
  dateRange: string;
  accessToken: string;
}): Promise<GoogleAdsMetricsResult> {
  const cleanedCustomerId = normalizeGoogleAdsCustomerId(clientCustomerId);
  const cleanedManagerId = normalizeGoogleAdsCustomerId(managerCustomerId);

  if (!cleanedCustomerId || !cleanedManagerId) {
    throw new Error("Google Ads customer and manager IDs are required.");
  }

  const apiVersion = process.env.GOOGLE_ADS_API_VERSION || "v25";
  const url = `https://googleads.googleapis.com/${apiVersion}/customers/${cleanedCustomerId}/googleAds:searchStream`;
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
    WHERE segments.date DURING ${dateRange}
    ORDER BY segments.date ASC
  `;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      "login-customer-id": cleanedManagerId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const rawText = await response.text();
  let payload: GoogleAdsMetricsResult | null = null;

  try {
    payload = rawText ? (JSON.parse(rawText) as GoogleAdsMetricsResult) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
        "Google Ads API request failed while loading metrics."
    );
  }

  return payload ?? { results: [] };
}

export async function fetchAccessibleGoogleAdsCustomers({
  accessToken,
}: {
  accessToken: string;
}): Promise<string[]> {
  const apiVersion = process.env.GOOGLE_ADS_API_VERSION || "v25";
  const response = await fetch(
    `https://googleads.googleapis.com/${apiVersion}/customers:listAccessibleCustomers`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
        "Content-Type": "application/json",
      },
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
