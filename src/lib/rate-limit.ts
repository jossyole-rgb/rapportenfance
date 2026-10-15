/**
 * Limiteur de débit en mémoire (fenêtre glissante simple).
 * Suffisant pour une instance unique ; en production multi-instances, utiliser un stockage partagé (voir docs/DEPLOIEMENT.md).
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { allowed: false, retryAfterMs: windowMs - (now - hits[0]!) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  }
  return { allowed: true, retryAfterMs: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}
