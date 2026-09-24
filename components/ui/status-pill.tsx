type Tone = "positive" | "caution" | "negative" | "neutral";

const tones: Record<Tone, string> = {
  positive: "bg-positive-tint text-positive",
  caution: "bg-caution-tint text-caution",
  negative: "bg-negative-tint text-negative",
  neutral: "bg-canvas text-ink-soft",
};

/**
 * Status vocabulary for the whole app, in one place.
 *
 * `expired` is deliberately caution rather than negative: nothing is broken by
 * the agency, it needs one reconnect, and red would read as data loss.
 */
const statusMap: Record<string, { label: string; tone: Tone }> = {
  connected: { label: "Connected", tone: "positive" },
  expired: { label: "Reconnect needed", tone: "caution" },
  disconnected: { label: "Not connected", tone: "neutral" },
  error: { label: "Error", tone: "negative" },
  active: { label: "Active", tone: "positive" },
  invited: { label: "Invited", tone: "neutral" },

  // Google Ads account and campaign states. Cancelled and closed differ: a
  // cancelled account can be reactivated by an admin, a closed one cannot
  // (Google's test accounts are always closed).
  enabled: { label: "Active", tone: "positive" },
  paused: { label: "Paused", tone: "neutral" },
  suspended: { label: "Suspended", tone: "caution" },
  canceled: { label: "Cancelled", tone: "negative" },
  closed: { label: "Closed", tone: "neutral" },
  removed: { label: "Removed", tone: "neutral" },
};

export function StatusPill({ status }: { status?: string | null }) {
  const key = (status ?? "").toLowerCase();
  const entry = statusMap[key] ?? { label: status || "Unknown", tone: "neutral" as Tone };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[entry.tone]}`}
    >
      {entry.label}
    </span>
  );
}
