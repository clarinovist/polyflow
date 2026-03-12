/**
 * In-memory sliding window rate limiter
 * configurable via environment variables
 */

const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();

export function rateLimit(ip: string, limit = parseInt(process.env.RATE_LIMIT_MAX || '100', 10), windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10)) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  // Clean up expired records occasionally to prevent memory leaks in long-running processes
  if (rateLimitMap.size > 10000) {
    for (const [key, value] of rateLimitMap.entries()) {
      if (value.expiresAt < now) {
        rateLimitMap.delete(key);
      }
    }
  }

  if (!record || record.expiresAt < now) {
    rateLimitMap.set(ip, { count: 1, expiresAt: now + windowMs });
    return { success: true, count: 1, remaining: limit - 1 };
  }
  
  if (record.count >= limit) {
    return { success: false, count: record.count, remaining: 0 };
  }
  
  record.count += 1;
  return { success: true, count: record.count, remaining: limit - record.count };
}
