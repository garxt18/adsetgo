"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
type Client = {
  id: string;
  agency_id: string;
  name: string;
  email: string;
  google_ads_customer_id: string;
  created_at: string;
};

type GoogleAdsMetrics = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  costPerConversion: number;
  conversionRate: number;
  averageCpc: number;
};

type TrendData = {
  date: string;
  clicks: number;
  conversions: number;
  cost: number;
};


export default function ClientPage() {
  const params = useParams();

  const slug = (Array.isArray(params?.slug) ? params.slug[0] : params?.slug) ?? "";
  const id = (Array.isArray(params?.id) ? params.id[0] : params?.id) ?? "";

  const [client, setClient] = useState<Client | null>(null);
  const [trendType, setTrendType] = useState("Clicks & Conversions");
  const [dateRange, setDateRange] = useState("Last 7 Days");
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [apiMetrics, setApiMetrics] = useState<GoogleAdsMetrics | null>(null);
  const [apiTrendData, setApiTrendData] = useState<TrendData[]>([]);
  const [googleAdsError, setGoogleAdsError] = useState<string | null>(null);

  const zeroMetrics: GoogleAdsMetrics = {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    ctr: 0,
    costPerConversion: 0,
    conversionRate: 0,
    averageCpc: 0,
  };

  const trendData = apiTrendData;
  const baseMetrics = apiMetrics ?? zeroMetrics;

  const metrics: GoogleAdsMetrics = {
    ...baseMetrics,
    ctr:
      baseMetrics.impressions > 0
        ? (baseMetrics.clicks / baseMetrics.impressions) * 100
        : 0,
    costPerConversion:
      baseMetrics.conversions > 0
        ? baseMetrics.cost / baseMetrics.conversions
        : 0,
    conversionRate:
      baseMetrics.clicks > 0
        ? (baseMetrics.conversions / baseMetrics.clicks) * 100
        : 0,
    averageCpc:
      baseMetrics.clicks > 0
        ? baseMetrics.cost / baseMetrics.clicks
        : 0,
  };

  useEffect(() => {
    async function loadClient() {
      try {
        const res = await fetch(`/api/agencies/${slug}/clients/${id}`);
        if (!res.ok) {
          const text = await res.text();
          console.error("Failed to load client", text);
          // Fallback: show a static demo client so the UI remains usable
          setClient({
            id,
            agency_id: slug,
            name: "Demo Client",
            email: "demo@example.com",
            google_ads_customer_id: "000-000-0000",
            created_at: new Date().toISOString(),
          });
          return;
        }

        const data = await res.json();
        setClient(data);
      } catch (err) {
        console.error("Error loading client:", err);
        setClient({
          id,
          agency_id: slug,
          name: "Demo Client",
          email: "demo@example.com",
          google_ads_customer_id: "000-000-0000",
          created_at: new Date().toISOString(),
        });
      }
    }

    if (id && slug) {
      loadClient();
    }
  }, [id, slug]);

  useEffect(() => {
    async function loadGoogleAdsData() {
      try {
        setIsLoadingMetrics(true);
        setGoogleAdsError(null);

        const { data: sessionData } = await supabase.auth.getUser();
        const userId = sessionData?.user?.id ?? null;

        const query = new URLSearchParams({
          clientId: id,
          dateRange,
        });

        if (userId) query.set("userId", userId);

        const response = await fetch(`/api/google-ads?${query.toString()}`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok || data?.status === "error" || data?.status === "not_configured") {
          const message =
            data?.message || "Google Ads is not connected or the account is not accessible.";

          setGoogleAdsError(message);
          setApiMetrics(null);
          setApiTrendData([]);
          return;
        }

        setApiMetrics(data.metrics ?? null);
        setApiTrendData(Array.isArray(data.trend) ? data.trend : []);
      } catch (error) {
        console.error(error);
        setGoogleAdsError("Unable to load live Google Ads data.");
        setApiMetrics(null);
        setApiTrendData([]);
      } finally {
        setIsLoadingMetrics(false);
      }
    }

    if (id) {
      loadGoogleAdsData();
    }
  }, [id, dateRange]);

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
<h1 className="text-3xl font-bold">
  {client ? client.name : "Loading..."}
</h1>

        <p className="mt-2 text-gray-600">
          View this client Google Ads data and account information.
        </p>
{client && (
<>
    <div className="mt-8 bg-white p-6 rounded-xl shadow">
      <h2 className="text-xl font-bold">
        Client Information
      </h2>

      <div className="mt-4 space-y-2">
        <p>
          <span className="font-medium">Email:</span>{" "}
          {client.email}
        </p>

        <p>
          <span className="font-medium">
            Google Ads Customer ID:
          </span>{" "}
          {client.google_ads_customer_id}
        </p>
      </div>
    </div>

    <div className="mt-8 bg-white p-6 rounded-xl shadow-sm border">
      <div className="flex items-center justify-between">
  <h2 className="text-xl font-bold">
    Google Ads Dashboard
  </h2>

  <select
  value={dateRange}
  onChange={(e) => setDateRange(e.target.value)}
  className="border rounded-lg px-3 py-2"
>
    <option>Last 7 Days</option>
    <option>Last 30 Days</option>
    <option>This Month</option>
  </select>
</div>
{googleAdsError ? (
  <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
    <strong>Google Ads connection issue:</strong> {googleAdsError}
  </div>
) : null}

{isLoadingMetrics ? (
  <p className="mt-6 text-gray-500">
    Loading Google Ads data...
  </p>
) : (
<div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">    
<div className="border rounded-lg bg-gray-50 p-4 shadow-sm">      
    <p className="text-sm text-gray-500">
        Impressions
      </p>
      <p className="mt-2 text-2xl font-bold">
        {metrics.impressions.toLocaleString()}
      </p>
    </div>

<div className="border rounded-lg bg-gray-50 p-4 shadow-sm">
      <p className="text-sm text-gray-500">
        Clicks
      </p>
      <p className="mt-2 text-2xl font-bold">
        {metrics.clicks.toLocaleString()}
      </p>
    </div>

<div className="border rounded-lg bg-gray-50 p-4 shadow-sm">
      <p className="text-sm text-gray-500">
        Cost
      </p>
      <p className="mt-2 text-2xl font-bold">
        ${metrics.cost.toLocaleString()}
      </p>
    </div>

    <div className="border rounded-lg bg-gray-50 p-4 shadow-sm">
        
      <p className="text-sm text-gray-500">
        Conversions
      </p>
      <p className="mt-2 text-2xl font-bold">
        {metrics.conversions.toLocaleString()}
      </p>
    </div>
    <div className="border rounded-lg bg-gray-50 p-4 shadow-sm">
  <p className="text-sm text-gray-500">
    CTR
  </p>

  <p className="mt-2 text-2xl font-bold">
    {metrics.ctr.toFixed(2)}%
  </p>
</div>
        <div className="border rounded-lg bg-gray-50 p-4 shadow-sm">
  <p className="text-sm text-gray-500">
    Cost / Conversion
  </p>

  <p className="mt-2 text-2xl font-bold">
    ${metrics.costPerConversion.toFixed(2)}
  </p>
</div>
        <div className="border rounded-lg bg-gray-50 p-4 shadow-sm">
  <p className="text-sm text-gray-500">
    Conversion Rate
  </p>

  <p className="mt-2 text-2xl font-bold">
    {metrics.conversionRate.toFixed(2)}%
  </p>
</div>
        <div className="border rounded-lg bg-gray-50 p-4 shadow-sm">
  <p className="text-sm text-gray-500">
    Average CPC
  </p>

  <p className="mt-2 text-2xl font-bold">
    ${metrics.averageCpc.toFixed(2)}
  </p>
</div>
  </div>
)}
<div className="mt-8 border-t pt-6">
<div className="flex items-center justify-between">
  <h3 className="text-lg font-bold">
    Performance Trend
  </h3>

  <select
  value={trendType}
  onChange={(e) => setTrendType(e.target.value)}
  className="border rounded-lg px-3 py-2 text-sm"
>
  <option>Clicks & Conversions</option>
  <option>Cost</option>
</select>
</div>

<div className="mt-6 h-80">
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={trendData}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />

      <XAxis dataKey="date" />

      <YAxis
  tickFormatter={(value) =>
    trendType === "Cost" ? `$${value}` : value
  }
/>

<Tooltip
  formatter={(value, name) => {
    if (name === "Cost") {
      return [`$${value}`, "Cost"];
    }

    return [
      value,
      name === "Clicks" ? "Clicks" : "Conversions",
    ];
  }}
/>

      <Legend />

{trendType === "Clicks & Conversions" ? (
  <>
    <Line
      type="monotone"
      dataKey="clicks"
      name="Clicks"
      stroke="#2563eb"
      strokeWidth={2}
      dot={{ r: 4 }}
      activeDot={{ r: 6 }}
    />

    <Line
      type="monotone"
      dataKey="conversions"
      name="Conversions"
      stroke="#9333ea"
      strokeWidth={2}
      dot={{ r: 4 }}
      activeDot={{ r: 6 }}
    />
  </>
) : (
  <Line
    type="monotone"
    dataKey="cost"
    name="Cost"
    stroke="#16a34a"
    strokeWidth={2}
    dot={{ r: 4 }}
    activeDot={{ r: 6 }}
  />
)}
    </LineChart>
  </ResponsiveContainer>
</div>
</div>
    </div>
</>
)}
      </div>
    </main>
  );
}