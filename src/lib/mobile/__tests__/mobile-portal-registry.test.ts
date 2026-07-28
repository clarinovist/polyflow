import { describe, it, expect } from 'vitest';
import {
    MOBILE_PORTAL_REGISTRY,
    MOBILE_ROUTE_ALIASES,
    getMobilePortalById,
    getMobilePortalsByStatus,
    isMobilePortalPath,
    resolveMobileAlias,
} from '../mobile-portal-registry';

describe('mobile-portal-registry', () => {
    // ── Registry shape ──────────────────────────────────────────────
    describe('MOBILE_PORTAL_REGISTRY', () => {
        it('has at least 3 ACTIVE portals', () => {
            const active = getMobilePortalsByStatus('ACTIVE');
            expect(active.length).toBeGreaterThanOrEqual(3);
        });

        it('every portal has required fields', () => {
            for (const portal of MOBILE_PORTAL_REGISTRY) {
                expect(portal.id).toBeTruthy();
                expect(portal.title).toBeTruthy();
                expect(portal.path).toMatch(/^\//);
                expect(portal.moduleKey).toBeTruthy();
                expect(portal.roles.length).toBeGreaterThan(0);
                expect(portal.permissionRoot).toMatch(/^\//);
            }
        });

        it('no duplicate IDs', () => {
            const ids = MOBILE_PORTAL_REGISTRY.map((p) => p.id);
            expect(new Set(ids).size).toBe(ids.length);
        });

        it('no duplicate paths', () => {
            const paths = MOBILE_PORTAL_REGISTRY.map((p) => p.path);
            expect(new Set(paths).size).toBe(paths.length);
        });
    });

    // ── getMobilePortalById ──────────────────────────────────────────
    describe('getMobilePortalById', () => {
        it('returns sales-field portal', () => {
            const portal = getMobilePortalById('sales-field');
            expect(portal).toBeDefined();
            expect(portal!.path).toBe('/field/sales');
            expect(portal!.status).toBe('ACTIVE');
        });

        it('returns warehouse portal', () => {
            const portal = getMobilePortalById('warehouse');
            expect(portal).toBeDefined();
            expect(portal!.path).toBe('/warehouse/mobile');
            expect(portal!.status).toBe('ACTIVE');
        });

        it('returns production-kiosk portal', () => {
            const portal = getMobilePortalById('production-kiosk');
            expect(portal).toBeDefined();
            expect(portal!.path).toBe('/kiosk');
            expect(portal!.status).toBe('ACTIVE');
        });

        it('returns undefined for unknown ID', () => {
            expect(getMobilePortalById('unknown' as any)).toBeUndefined();
        });
    });

    // ── getMobilePortalsByStatus ─────────────────────────────────────
    describe('getMobilePortalsByStatus', () => {
        it('ACTIVE portals include sales, warehouse, kiosk', () => {
            const active = getMobilePortalsByStatus('ACTIVE');
            const paths = active.map((p) => p.path);
            expect(paths).toContain('/field/sales');
            expect(paths).toContain('/warehouse/mobile');
            expect(paths).toContain('/kiosk');
        });

        it('PLANNED portals include maklon', () => {
            const planned = getMobilePortalsByStatus('PLANNED');
            const ids = planned.map((p) => p.id);
            expect(ids).toContain('maklon');
        });
    });

    // ── isMobilePortalPath ───────────────────────────────────────────
    describe('isMobilePortalPath', () => {
        it.each([
            ['/field/sales', true],
            ['/field/sales/orders', true],
            ['/warehouse/mobile', true],
            ['/warehouse/mobile/incoming', true],
            ['/kiosk', true],
            ['/kiosk/attendance', true],
            ['/production/mobile', true],
            ['/purchasing/mobile', true],
            ['/finance/mobile', true],
            ['/hrd/mobile', true],
            ['/maklon/mobile', true],
            ['/dashboard', false],
            ['/sales', false],
            ['/finance', false],
        ])('path "%s" → %s', (path, expected) => {
            expect(isMobilePortalPath(path)).toBe(expected);
        });
    });

    // ── resolveMobileAlias ──────────────────────────────────────────
    describe('resolveMobileAlias', () => {
        it('resolves /sales/mobile to /field/sales', () => {
            expect(resolveMobileAlias('/sales/mobile')).toBe('/field/sales');
        });

        it('resolves /sales/mobile/orders to /field/sales/orders', () => {
            expect(resolveMobileAlias('/sales/mobile/orders')).toBe(
                '/field/sales/orders',
            );
        });

        it('resolves /sales/mobile/customers/123 to /field/sales/customers/123', () => {
            expect(resolveMobileAlias('/sales/mobile/customers/123')).toBe(
                '/field/sales/customers/123',
            );
        });

        it('returns non-aliased paths unchanged', () => {
            expect(resolveMobileAlias('/field/sales')).toBe('/field/sales');
            expect(resolveMobileAlias('/warehouse/mobile')).toBe(
                '/warehouse/mobile',
            );
            expect(resolveMobileAlias('/dashboard')).toBe('/dashboard');
        });
    });

    // ── Route aliases ────────────────────────────────────────────────
    describe('MOBILE_ROUTE_ALIASES', () => {
        it('maps /sales/mobile to /field/sales', () => {
            expect(MOBILE_ROUTE_ALIASES['/sales/mobile']).toBe('/field/sales');
        });
    });
});
