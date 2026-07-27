import { describe, it, expect } from 'vitest';
import {
    resolveFeatureFromPath,
    normalizePathname,
    getAllRegisteredFeatures,
} from '../feature-registry';

describe('Feature Registry', () => {
    it('normalizes pathnames correctly', () => {
        expect(normalizePathname('/sales/orders?tab=active#item-1')).toBe('/sales/orders');
        expect(normalizePathname('/production/orders/123/')).toBe('/production/orders/123');
        expect(normalizePathname('sales/customers')).toBe('/sales/customers');
    });

    it('resolves static sales and warehouse routes to exact feature keys', () => {
        const salesRes = resolveFeatureFromPath('/sales/orders');
        expect(salesRes).toEqual({
            featureKey: 'sales.orders.list',
            moduleKey: 'sales',
            label: 'Daftar Sales Order',
        });

        const whRes = resolveFeatureFromPath('/warehouse/inventory');
        expect(whRes).toEqual({
            featureKey: 'warehouse.inventory.list',
            moduleKey: 'warehouse',
            label: 'Stok Barang & Material',
        });

        const finRes = resolveFeatureFromPath('/finance/coa');
        expect(finRes).toEqual({
            featureKey: 'finance.coa',
            moduleKey: 'finance',
            label: 'Bagan Akun (CoA)',
        });
    });

    it('resolves dashboard sub-routes before generic dashboard overview', () => {
        const prodRes = resolveFeatureFromPath('/dashboard/products');
        expect(prodRes?.featureKey).toBe('dashboard.products');

        const overviewRes = resolveFeatureFromPath('/dashboard');
        expect(overviewRes?.featureKey).toBe('dashboard.overview');
    });

    it('resolves dynamic detail routes without leaking dynamic IDs', () => {
        const res = resolveFeatureFromPath('/sales/orders/so-9988-77');
        expect(res).toEqual({
            featureKey: 'sales.orders.detail',
            moduleKey: 'sales',
            label: 'Detail Sales Order',
        });
        expect(res?.featureKey).not.toContain('so-9988-77');
    });

    it('excludes static assets, login, auth, kiosk, my, and admin platform pages', () => {
        expect(resolveFeatureFromPath('/_next/static/chunks/main.js')).toBeNull();
        expect(resolveFeatureFromPath('/api/auth/session')).toBeNull();
        expect(resolveFeatureFromPath('/login')).toBeNull();
        expect(resolveFeatureFromPath('/admin/super-admin')).toBeNull();
        expect(resolveFeatureFromPath('/kiosk')).toBeNull();
        expect(resolveFeatureFromPath('/my/absensi')).toBeNull();
    });

    it('returns null for unregistered / arbitrary paths (allowlist enforcement)', () => {
        expect(resolveFeatureFromPath('/unknown-path/foo/bar')).toBeNull();
    });

    it('has no duplicate feature keys in the registry', () => {
        const features = getAllRegisteredFeatures();
        const keys = features.map((f) => f.featureKey);
        const uniqueKeys = new Set(keys);
        expect(keys.length).toBe(uniqueKeys.size);
    });
});
