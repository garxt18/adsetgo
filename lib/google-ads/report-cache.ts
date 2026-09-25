/**
 * Short-lived cache for Google Ads responses: report queries, the account tree
 * and access tokens.
 *
 * An Explorer developer token allows 2,880 operations a day across every agency
 * on the platform, and each dashboard view asks for two windows (the period and
 * the one before it, for the change figures). Without this, one person leaving
 * a dashboard open and refreshing would spend the whole platform's daily
 * allowance.
 *
 * Deliberately in-process: it needs no infrastructure, and a cold start simply
 * refetches. Several server instances each keep their own copy, which costs a
 * little more quota but never serves one tenant's figures to another, because
 * the key includes the customer id.
 */

type Entry<T> = { value: T; expiresAt: number };

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 500;

const store = new Map<string, Entry<unknown>>();

// Loads still in progress, so that two requests arriving together share one
// call to Google instead of both spending quota on the same answer.
const pending = new Map<string, Promise<unknown>>();

export function reportCacheKey(parts: Array<string | null | undefined>): string {
  return parts.map((part) => part ?? "").join("|");
}

export async function withReportCache<T>(
  key: string,
  load: () => Promise<T>,
  ttlMs = TTL_MS
): Promise<T> {
  const hit = store.get(key);

  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }

  const inFlight = pending.get(key);
  if (inFlight) return inFlight as Promise<T>;

  const loading = load()
    .then((value) => {
      // Evict the oldest insertion rather than growing without bound; Map
      // preserves insertion order, so the first key is the oldest.
      if (store.size >= MAX_ENTRIES) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }

      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => pending.delete(key));

  pending.set(key, loading);
  return loading;
}

/** Drop an entry that is known to be wrong, so the next request loads it again. */
export function forgetCached(key: string): void {
  store.delete(key);
}
