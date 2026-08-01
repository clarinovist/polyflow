import { describe, it, expect, afterEach } from 'vitest';
import { verifyCronAuth } from '../cron-auth';

function makeRequest(authHeader?: string): Request {
  return new Request('http://localhost/api/cron/test', {
    headers: authHeader !== undefined ? { authorization: authHeader } : {},
  });
}

describe('verifyCronAuth', () => {
  const originalEnv = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalEnv;
    }
  });

  it('returns 401 when CRON_SECRET is not set', () => {
    delete process.env.CRON_SECRET;
    const result = verifyCronAuth(makeRequest('Bearer test-token'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });

  it('returns 401 when authorization header is missing', () => {
    process.env.CRON_SECRET = 'my-secret';
    const result = verifyCronAuth(makeRequest());
    expect(result.ok).toBe(false);
  });

  it('returns 401 when token is wrong', () => {
    process.env.CRON_SECRET = 'my-secret';
    const result = verifyCronAuth(makeRequest('Bearer wrong-token'));
    expect(result.ok).toBe(false);
  });

  it('returns ok when token matches', () => {
    process.env.CRON_SECRET = 'my-secret';
    const result = verifyCronAuth(makeRequest('Bearer my-secret'));
    expect(result.ok).toBe(true);
  });
});
