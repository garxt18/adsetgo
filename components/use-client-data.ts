"use client";

import { useEffect, useState } from "react";

import type { RangeValue } from "@/lib/google-ads/date-range";

export type Loaded<T> = {
  data: T | null;
  status: "loading" | "ready" | "unavailable";
  message: string;
};

const UNAVAILABLE = {
  notConfigured: "This client has no Google Ads account linked yet.",
  failed: "The Google Ads connection needs attention, so figures are paused.",
};

/**
 * One of a client's reports for a period, from a report endpoint. The main
 * report and the Calls tab both load through this, so there is one place that
 * knows how a report request can fail.
 *
 * While a new period loads, the previous figures stay available, so headers
 * built from them do not flash empty.
 */
export function useClientData<T>(
  endpoint: string,
  clientId: string,
  range: RangeValue,
  messages: { notConfigured: string; failed: string } = UNAVAILABLE
): Loaded<T> {
  const key = `${endpoint}|${clientId}|${range}`;
  const [result, setResult] = useState<(Loaded<T> & { key: string }) | null>(null);
  const { notConfigured, failed } = messages;

  useEffect(() => {
    // Guards against a slower earlier request landing after a faster later one
    // and overwriting the period the reader actually chose.
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${endpoint}?${new URLSearchParams({ clientId, dateRange: range })}`);
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok || data.status === "error" || data.status === "not_configured") {
          setResult({
            key,
            data: null,
            status: "unavailable",
            message: data.status === "not_configured" ? notConfigured : failed,
          });
          return;
        }

        setResult({ key, data: data as T, status: "ready", message: "" });
      } catch {
        if (cancelled) return;
        setResult({
          key,
          data: null,
          status: "unavailable",
          message: "The report could not be loaded. Try again in a moment.",
        });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [endpoint, clientId, range, key, notConfigured, failed]);

  const current = result?.key === key;

  return {
    data: result?.data ?? null,
    status: current ? result.status : "loading",
    message: current ? result.message : "",
  };
}
