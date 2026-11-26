/** Fixed-window limiter keyed by bucket name. */
const windows = new Map<string, { count: number; resetAt: number }>();

export function takeToken(bucket: string, limitPerMinute: number): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const current = windows.get(bucket);

  if (!current || now >= current.resetAt) {
    const resetAt = now + 60_000;
    windows.set(bucket, { count: 1, resetAt });
    return { allowed: true, remaining: limitPerMinute - 1, resetAt };
  }

  if (current.count >= limitPerMinute) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: limitPerMinute - current.count,
    resetAt: current.resetAt,
  };
}

export function rateLimitSnapshot() {
  const now = Date.now();
  return [...windows.entries()].map(([bucket, v]) => ({
    bucket,
    count: v.count,
    resetAt: v.resetAt,
    active: now < v.resetAt,
  }));
}

/** Test helper — wipe all buckets. */
export function resetRateLimits() {
  windows.clear();
}
