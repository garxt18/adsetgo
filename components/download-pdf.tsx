"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/** The server's file name, from Content-Disposition (UTF-8 form preferred). */
function filenameFrom(header: string | null, fallback: string): string {
  const utf8 = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) return decodeURIComponent(utf8);
  return header?.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
}

/**
 * Downloads a report PDF built on the server for the period on screen.
 *
 * Fetched rather than linked, so the few seconds it takes to build show as
 * "Preparing PDF…", and a refusal or a Google outage reads as a sentence
 * instead of a downloaded file full of error JSON.
 */
export function DownloadPdfButton({
  href,
  disabled = false,
  size = "nav",
}: {
  /** The PDF route, including the chosen period. */
  href: string;
  disabled?: boolean;
  size?: "sm" | "nav";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");

    try {
      const res = await fetch(href);

      if (!res.ok || res.headers.get("content-type") !== "application/pdf") {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "The PDF could not be created. Try again in a moment.");
        return;
      }

      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFrom(res.headers.get("content-disposition"), "report.pdf");
      link.click();
      // Revoked on the next tick: some browsers start the download only after
      // the click handler returns.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setError("The PDF could not be created. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="relative inline-flex">
      <Button variant="secondary" size={size} onClick={download} disabled={disabled || busy}>
        {busy ? "Preparing PDF…" : "Download PDF"}
      </Button>
      {error ? (
        <span
          role="alert"
          className="absolute right-0 top-full z-10 mt-2 w-64 rounded-xl bg-negative-tint px-3 py-2 text-xs text-negative shadow-sm ring-1 ring-negative/20"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
