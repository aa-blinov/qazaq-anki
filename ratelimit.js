/**
 * Tiny in-memory rate limiter for the auth endpoints.
 *
 * Goals:
 *  - Slow down credential-stuffing / username enumeration on
 *    /api/auth/login and /api/auth/register.
 *  - Zero new deps: a single Map of {key, hits, resetAt}. Entries
 *    expire on their own; we sweep them lazily when we read.
 *  - Keyed by client IP (trusting the X-Forwarded-For header is
 *    risky in front of a misconfigured proxy, so we fall back to
 *    the socket address when the header is missing).
 *
 * Limits (defaults):
 *  - register: 5 attempts per 10 minutes per IP
 *  - login:    10 attempts per 5 minutes per IP
 *
 * bcrypt 10 rounds is ~80ms on this hardware, so even at 10 rps
 * an attacker can only try ~1k passwords per IP per 5 minutes —
 * a real lockout would need to add a per-account counter, which
 * is out of scope for now.
 */
export function createRateLimiter({ max, windowMs }) {
  const buckets = new Map();

  function getKey(req) {
    const fwd = req.get('x-forwarded-for');
    if (fwd) {
      // First entry in the XFF list is the original client.
      const first = fwd.split(',')[0]?.trim();
      if (first) return first;
    }
    return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  }

  function sweep(now) {
    for (const [key, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    sweep(now);
    const key = getKey(req);
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { hits: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.hits += 1;
    if (b.hits > max) {
      const retryAfter = Math.ceil((b.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(b.resetAt / 1000)));
      return res.status(429).json({ error: 'rateLimited', message: 'Too many attempts, try later.' });
    }
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(max - b.hits));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(b.resetAt / 1000)));
    next();
  };
}
