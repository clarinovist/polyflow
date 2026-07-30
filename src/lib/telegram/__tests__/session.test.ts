import { describe, it, expect } from 'vitest';
import { hashToken, extractSessionTokenFromCookieHeader, buildSessionCookieHeader, buildClearSessionCookieHeader } from '../session';

describe('session helpers (no DB)', () => {
  it('hashToken is deterministic sha256 hex 64', () => {
    const h1 = hashToken('abc');
    const h2 = hashToken('abc');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('different tokens produce different hashes', () => {
    expect(hashToken('token1')).not.toBe(hashToken('token2'));
  });

  it('extractSessionTokenFromCookieHeader parses polyflow_tg', () => {
    const prev = process.env.TELEGRAM_SESSION_COOKIE_NAME;
    process.env.TELEGRAM_SESSION_COOKIE_NAME = 'polyflow_tg';

    const header = 'other=foo; polyflow_tg=rawtoken123; another=bar';
    expect(extractSessionTokenFromCookieHeader(header)).toBe('rawtoken123');

    const missing = 'other=foo';
    expect(extractSessionTokenFromCookieHeader(missing)).toBeNull();

    expect(extractSessionTokenFromCookieHeader(null)).toBeNull();

    if (prev === undefined) delete process.env.TELEGRAM_SESSION_COOKIE_NAME;
    else process.env.TELEGRAM_SESSION_COOKIE_NAME = prev;
  });

  it('buildSessionCookieHeader contains HttpOnly and name', () => {
    const cookie = buildSessionCookieHeader('mytoken', { isProduction: false });
    expect(cookie).toContain('polyflow_tg=mytoken');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
  });

  it('buildClearSessionCookieHeader expires cleared', () => {
    const cleared = buildClearSessionCookieHeader();
    expect(cleared).toContain('Max-Age=0');
  });
});
