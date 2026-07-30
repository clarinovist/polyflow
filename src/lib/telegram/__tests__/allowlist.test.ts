import { describe, it, expect } from 'vitest';
import {
  parseAllowlistEmails,
  isEmailAllowlisted,
  isAdminRole,
  checkPilotAdminGate,
  isPilotTenant,
} from '../allowlist';

describe('allowlist', () => {
  it('parses comma list case-insensitive trimmed', () => {
    const list = parseAllowlistEmails('A@ex.com, b@EX.COM , , c@ex.com');
    expect(list).toEqual(['a@ex.com', 'b@ex.com', 'c@ex.com']);
  });

  it('empty allowlist allows all', () => {
    const res = isEmailAllowlisted('any@ex.com', '');
    expect(res.allowed).toBe(true);
    expect(res.isEmpty).toBe(true);
  });

  it('email in allowlist passes', () => {
    const res = isEmailAllowlisted('Admin@Ex.com', 'admin@ex.com, other@ex.com');
    expect(res.allowed).toBe(true);
    expect(res.isEmpty).toBe(false);
  });

  it('email not in allowlist fails when list set', () => {
    const res = isEmailAllowlisted('nope@ex.com', 'admin@ex.com');
    expect(res.allowed).toBe(false);
    expect(res.isEmpty).toBe(false);
  });

  it('isAdminRole detects ADMIN via role or roles', () => {
    expect(isAdminRole({ role: 'ADMIN' })).toBe(true);
    expect(isAdminRole({ role: 'admin' })).toBe(true);
    expect(isAdminRole({ role: 'WAREHOUSE', roles: ['ADMIN'] })).toBe(true);
    expect(isAdminRole({ role: 'WAREHOUSE' })).toBe(false);
    expect(isAdminRole({ isSuperAdmin: true })).toBe(true);
  });

  it('checkPilotAdminGate requires ADMIN', () => {
    const r1 = checkPilotAdminGate({ role: 'WAREHOUSE', email: 'a@b.com' });
    expect(r1.allowed).toBe(false);
  });

  it('checkPilotAdminGate respects allowlist', () => {
    const prev = process.env.TELEGRAM_PILOT_ADMIN_ALLOWLIST;
    process.env.TELEGRAM_PILOT_ADMIN_ALLOWLIST = 'allowed@ex.com';

    const blocked = checkPilotAdminGate({ role: 'ADMIN', email: 'not@ex.com' });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('allowlist');

    const allowed = checkPilotAdminGate({ role: 'ADMIN', email: 'allowed@ex.com' });
    expect(allowed.allowed).toBe(true);

    if (prev === undefined) delete process.env.TELEGRAM_PILOT_ADMIN_ALLOWLIST;
    else process.env.TELEGRAM_PILOT_ADMIN_ALLOWLIST = prev;
  });

  it('isPilotTenant checks pilot subdomain env', () => {
    const prev = process.env.TELEGRAM_PILOT_TENANT_SUBDOMAIN;
    process.env.TELEGRAM_PILOT_TENANT_SUBDOMAIN = 'melindo';

    expect(isPilotTenant('melindo')).toBe(true);
    expect(isPilotTenant('Melindo')).toBe(true);
    expect(isPilotTenant('kiyowo')).toBe(false);
    expect(isPilotTenant(null)).toBe(false);

    if (prev === undefined) delete process.env.TELEGRAM_PILOT_TENANT_SUBDOMAIN;
    else process.env.TELEGRAM_PILOT_TENANT_SUBDOMAIN = prev;
  });
});
