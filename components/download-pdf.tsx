"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * "Download PDF" on a desktop, an icon and "PDF" on a phone. The client's top
 * bar holds both downloads, the theme toggle and Sign out; at full length they
 * pushed Sign out off a 360px screen. The button's aria-label keeps the full
 * name for screen readers at every width.
 */
export function DownloadLabel({ format, busy = false }: { format: "CSV" | "PDF"; busy?: boolean }) {
  return (
    <>
      <svg
        className="sm:hidden"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
      </svg>
      <span className="sm:hidden">{busy ? "…" : format}</span>
      <span className="hidden sm:inline">{busy ? `Preparing ${format}…` : `Download ${format}`}</span>
    </>
  );
}

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
      <Button
        variant="secondary"
        size={size}
        onClick={download}
        disabled={disabled || busy}
        aria-label={busy ? "Preparing PDF" : "Download PDF"}
        aria-busy={busy}
      >
        <DownloadLabel format="PDF" busy={busy} />
      </Button>
      {error ? (
        <span
          role="alert"
          // Right-aligned under the button on a desktop. On a phone the
          // button's place in its row varies, and a box anchored to it ran
          // off one edge or the other, so there it is pinned to the screen,
          // like the custom date panel.
          className="absolute right-0 top-full z-10 mt-2 w-64 max-sm:fixed max-sm:inset-x-4 max-sm:top-20 max-sm:mt-0 max-sm:w-auto rounded-xl bg-negative-tint px-3 py-2 text-xs text-negative shadow-sm ring-1 ring-negative/20"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
