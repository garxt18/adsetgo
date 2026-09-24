/**
 * Short-lived cache for Google Ads report queries.
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

export function reportCacheKey(parts: Array<string | null | undefined>): string {
  return parts.map((part) => part ?? "").join("|");
}

export async function withReportCache<T>(
  key: string,
  load: () => Promise<T>
): Promise<T> {
  const hit = store.get(key);

  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }

  const value = await load();

  // Evict the oldest insertion rather than growing without bound; Map preserves
  // insertion order, so the first key is the oldest.
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }

  store.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}
