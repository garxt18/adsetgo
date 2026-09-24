/**
 * Where a signed-in person belongs: the platform dashboard, their agency's
 * workspace, or their own client report.
 *
 * Signing in, accepting an invitation and resetting a password all finish by
 * asking this, so the three can never disagree about where a role lands. The
 * profile decides, never the URL someone arrived on.
 *
 * Returns null when the account has no usable profile, which callers treat as
 * "not set up yet" rather than guessing.
 */
export async function homePathFor(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/home", { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { path: string | null }).path;
  } catch {
    return null;
  }
}
