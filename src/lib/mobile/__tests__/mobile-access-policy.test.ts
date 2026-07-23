import { describe, it, expect } from 'vitest';
import {
  isMobileUserAgent,
  isMobilePublicPath,
  isMobileAllowlistedPath,
  shouldSoftLandToSalesMobile,
  shouldSoftLandToWarehouseMobile,
  shouldSoftLandToKiosk,
  shouldSoftLandDashboard,
  isMobileBypassAllowed,
  getMobileHomeForUser,
  getMobileHomeCtaKey,
} from '../mobile-access-policy';

describe('mobile-access-policy', () => {
  // ── isMobileUserAgent ──────────────────────────────────────────────
  describe('isMobileUserAgent', () => {
    it.each([
      ['Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)', true],
      ['Mozilla/5.0 (Linux; Android 10)', true],
      ['Mozilla/5.0 (iPad; CPU OS 13_2_3 like Mac OS X)', true],
      ['Mozilla/5.0 (iPod; CPU iPhone OS 13_2_3 like Mac OS X)', true],
      ['Opera/9.80 (J2ME/MIDP; Opera Mini/9.80)', true],
      ['Mozilla/5.0 (BlackBerry; U; BlackBerry 10)', true],
      ['Mozilla/5.0 (IEMobile; Windows Phone)', true],
      ['Mozilla/5.0 (webOS; LG-TP260)', true],
      ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', false],
      ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', false],
      ['Mozilla/5.0 (X11; Linux x86_64)', false],
      [null, false],
      [undefined, false],
      ['', false],
    ])('UA "%s" → %s', (ua, expected) => {
      expect(isMobileUserAgent(ua)).toBe(expected);
    });
  });

  // ── isMobilePublicPath ─────────────────────────────────────────────
  describe('isMobilePublicPath', () => {
    it.each([
      ['/login', true],
      ['/logout', true],
      ['/register', true],
      ['/device/desktop-required', true],
      ['/api/auth/csrf', true],
      ['/dashboard', false],
      ['/finance', false],
      ['/sales/mobile', false],
      ['/kiosk', false],
    ])('path "%s" → %s', (path, expected) => {
      expect(isMobilePublicPath(path)).toBe(expected);
    });
  });

  // ── isMobileAllowlistedPath ────────────────────────────────────────
  describe('isMobileAllowlistedPath', () => {
    it.each([
      ['/sales/mobile', true],
      ['/sales/mobile/orders', true],
      ['/sales/mobile/orders/create', true],
      ['/kiosk', true],
      ['/kiosk/production', true],
      ['/kiosk/attendance', true],
      ['/my', true],
      ['/my/login', true],
      ['/my/gaji', true],
      ['/warehouse/mobile', true],
      ['/warehouse/mobile/outgoing', true],
      ['/warehouse/mobile/incoming', true],
      ['/dashboard', false],
      ['/finance', false],
      ['/finance/journals', false],
      ['/sales', false],
      ['/sales/orders', false],
      ['/production', false],
      ['/warehouse', false],
      ['/warehouse/outgoing', false],
      ['/warehouse/inventory', false],
      ['/hrd', false],
      ['/purchasing', false],
      ['/maklon', false],
      ['/admin', false],
    ])('path "%s" → %s', (path, expected) => {
      expect(isMobileAllowlistedPath(path)).toBe(expected);
    });
  });

  // ── shouldSoftLandToSalesMobile ────────────────────────────────────
  describe('shouldSoftLandToSalesMobile', () => {
    it.each([
      ['/sales', true],
      ['/sales/orders', true],
      ['/sales/invoices', true],
      ['/sales/quotations', true],
      ['/sales/mobile', false],
      ['/sales/mobile/orders', false],
      ['/kiosk', false],
      ['/dashboard', false],
    ])('path "%s" → %s', (path, expected) => {
      expect(shouldSoftLandToSalesMobile(path)).toBe(expected);
    });
  });

  // ── shouldSoftLandToWarehouseMobile ────────────────────────────────
  describe('shouldSoftLandToWarehouseMobile', () => {
    it.each([
      ['/warehouse', true],
      ['/warehouse/outgoing', true],
      ['/warehouse/incoming', true],
      ['/warehouse/mobile', false],
      ['/warehouse/mobile/outgoing', false],
      ['/sales', false],
    ])('path "%s" → %s', (path, expected) => {
      expect(shouldSoftLandToWarehouseMobile(path)).toBe(expected);
    });
  });

  // ── shouldSoftLandToKiosk ──────────────────────────────────────────
  describe('shouldSoftLandToKiosk', () => {
    it.each([
      ['/production', true],
      ['/production/orders', true],
      ['/kiosk', false],
      ['/sales', false],
    ])('path "%s" → %s', (path, expected) => {
      expect(shouldSoftLandToKiosk(path)).toBe(expected);
    });
  });

  // ── shouldSoftLandDashboard ────────────────────────────────────────
  describe('shouldSoftLandDashboard', () => {
    it.each([
      ['/dashboard', true],
      ['/dashboard/products', false],
      ['/sales', false],
    ])('path "%s" → %s', (path, expected) => {
      expect(shouldSoftLandDashboard(path)).toBe(expected);
    });
  });

  // ── isMobileBypassAllowed ──────────────────────────────────────────
  describe('isMobileBypassAllowed', () => {
    it('ADMIN → true', () => {
      expect(isMobileBypassAllowed({ role: 'ADMIN' })).toBe(true);
    });

    it('ADMIN in roles array → true', () => {
      expect(isMobileBypassAllowed({ roles: ['SALES', 'ADMIN'] })).toBe(true);
    });

    it('isSuperAdmin → true', () => {
      expect(isMobileBypassAllowed({ isSuperAdmin: true })).toBe(true);
    });

    it('SALES → false', () => {
      expect(isMobileBypassAllowed({ role: 'SALES' })).toBe(false);
    });

    it('FINANCE → false', () => {
      expect(isMobileBypassAllowed({ role: 'FINANCE' })).toBe(false);
    });

    it('PRODUCTION → false', () => {
      expect(isMobileBypassAllowed({ role: 'PRODUCTION' })).toBe(false);
    });

    it('WAREHOUSE → false', () => {
      expect(isMobileBypassAllowed({ role: 'WAREHOUSE' })).toBe(false);
    });

    it('null user → false', () => {
      expect(isMobileBypassAllowed(null)).toBe(false);
    });

    it('undefined user → false', () => {
      expect(isMobileBypassAllowed(undefined)).toBe(false);
    });
  });

  // ── getMobileHomeForUser ───────────────────────────────────────────
  describe('getMobileHomeForUser', () => {
    it('SALES → /sales/mobile', () => {
      expect(getMobileHomeForUser({ role: 'SALES' })).toBe('/sales/mobile');
    });

    it('PRODUCTION → /kiosk', () => {
      expect(getMobileHomeForUser({ role: 'PRODUCTION' })).toBe('/kiosk');
    });

    it('ADMIN (no specific home) → null', () => {
      expect(getMobileHomeForUser({ role: 'ADMIN' })).toBeNull();
    });

    it('FINANCE → null', () => {
      expect(getMobileHomeForUser({ role: 'FINANCE' })).toBeNull();
    });

    it('WAREHOUSE → /warehouse/mobile', () => {
      expect(getMobileHomeForUser({ role: 'WAREHOUSE' })).toBe('/warehouse/mobile');
    });

    it('SALES+PRODUCTION → /sales/mobile (SALES matched first)', () => {
      expect(getMobileHomeForUser({ roles: ['SALES', 'PRODUCTION'] })).toBe('/sales/mobile');
    });

    it('WAREHOUSE+PRODUCTION → /warehouse/mobile (WAREHOUSE before PRODUCTION)', () => {
      expect(getMobileHomeForUser({ roles: ['WAREHOUSE', 'PRODUCTION'] })).toBe(
        '/warehouse/mobile',
      );
    });
  });

  // ── getMobileHomeCtaKey — same priority as getMobileHomeForUser ─────
  describe('getMobileHomeCtaKey', () => {
    it('matches path priority for multi-role WAREHOUSE+PRODUCTION', () => {
      const user = { roles: ['WAREHOUSE', 'PRODUCTION'] };
      expect(getMobileHomeForUser(user)).toBe('/warehouse/mobile');
      expect(getMobileHomeCtaKey(user)).toBe('warehouse');
    });

    it('SALES first', () => {
      expect(getMobileHomeCtaKey({ roles: ['SALES', 'WAREHOUSE'] })).toBe('sales');
    });

    it('null for FINANCE', () => {
      expect(getMobileHomeCtaKey({ role: 'FINANCE' })).toBeNull();
    });
  });
});
