import { describe, it, expect } from 'vitest';
import { isPublicChangelogPath } from '@/components/layout/changelog-banner-client';

/**
 * The changelog banner renders internal release notes: unreleased module names,
 * internal phase labels, and a link to the private repo. Rendering it on a page
 * an anonymous visitor can reach leaks that to the public, so the path guard is
 * the security boundary — it gets its own test.
 */
describe('isPublicChangelogPath', () => {
    it('treats the marketing landing page as public', () => {
        expect(isPublicChangelogPath('/')).toBe(true);
    });

    it.each([
        '/login',
        '/register',
        '/logout',
        '/terms',
        '/privacy',
        '/kiosk',
    ])('treats %s as public', (pathname) => {
        expect(isPublicChangelogPath(pathname)).toBe(true);
    });

    it.each([
        '/login/callback',
        '/register/verify',
        '/kiosk/attendance',
        '/privacy/cookies',
    ])('treats nested public route %s as public', (pathname) => {
        expect(isPublicChangelogPath(pathname)).toBe(true);
    });

    it('fails closed when the pathname is not yet known', () => {
        expect(isPublicChangelogPath(null)).toBe(true);
        expect(isPublicChangelogPath('')).toBe(true);
    });

    it.each([
        '/dashboard',
        '/warehouse/mobile/outgoing',
        '/finance/invoices/sales',
        '/production/orders',
        '/hrd/payroll-monthly',
        '/admin/usage-analytics',
    ])('treats authenticated route %s as internal', (pathname) => {
        expect(isPublicChangelogPath(pathname)).toBe(false);
    });

    it('does not let a public prefix match an unrelated route', () => {
        // '/registerable' and '/terminals' must NOT be swallowed by the
        // '/register' and '/terms' prefixes — that would silently hide the
        // banner on real internal pages.
        expect(isPublicChangelogPath('/registerable')).toBe(false);
        expect(isPublicChangelogPath('/terminals')).toBe(false);
        expect(isPublicChangelogPath('/loginary')).toBe(false);
    });
});
