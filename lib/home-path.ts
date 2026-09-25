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

/**
 * For a page that turned out not to be this person's -- a platform page opened
 * while signed in as an agency, say: go to their own workspace instead of
 * stopping at an error whose only way out led back to the same sign-in.
 *
 * Returns false when there is nowhere better to go, so the page can offer to
 * sign out instead.
 */
export async function redirectHome(router: { replace: (path: string) => void }): Promise<boolean> {
  const path = await homePathFor();
  if (!path || path === window.location.pathname) return false;

  router.replace(path);
  return true;
}
