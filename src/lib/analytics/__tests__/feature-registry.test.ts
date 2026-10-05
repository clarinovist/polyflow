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

    it('excludes static assets, login, auth, kiosk hub root, my, and admin platform pages', () => {
        expect(resolveFeatureFromPath('/_next/static/chunks/main.js')).toBeNull();
        expect(resolveFeatureFromPath('/api/auth/session')).toBeNull();
        expect(resolveFeatureFromPath('/login')).toBeNull();
        expect(resolveFeatureFromPath('/admin/super-admin')).toBeNull();
        expect(resolveFeatureFromPath('/kiosk')).toBeNull();
        expect(resolveFeatureFromPath('/my/absensi')).toBeNull();
    });

    it('resolves kiosk shop-floor sub-routes (not excluded like the hub root)', () => {
        expect(resolveFeatureFromPath('/kiosk/jobs')).toEqual({
            featureKey: 'kiosk.jobs.list',
            moduleKey: 'kiosk',
            label: 'Daftar Job Kiosk Produksi',
        });

        const detailRes = resolveFeatureFromPath('/kiosk/jobs/po-123');
        expect(detailRes).toEqual({
            featureKey: 'kiosk.jobs.detail',
            moduleKey: 'kiosk',
            label: 'Fokus Job Kiosk Produksi',
        });
        expect(detailRes?.featureKey).not.toContain('po-123');

        expect(resolveFeatureFromPath('/kiosk/production/hd')).toEqual({
            featureKey: 'kiosk.production_form',
            moduleKey: 'kiosk',
            label: 'Input Produksi Kiosk (HD/Potong-Plong)',
        });
        expect(resolveFeatureFromPath('/kiosk/production/potongplong')).toEqual({
            featureKey: 'kiosk.production_form',
            moduleKey: 'kiosk',
            label: 'Input Produksi Kiosk (HD/Potong-Plong)',
        });

        expect(resolveFeatureFromPath('/kiosk/attendance')).toEqual({
            featureKey: 'kiosk.attendance',
            moduleKey: 'kiosk',
            label: 'Presensi Kiosk',
        });
    });

    it('returns null for unregistered / arbitrary paths (allowlist enforcement)', () => {
        expect(resolveFeatureFromPath('/unknown-path/foo/bar')).toBeNull();
    });

    it('resolves mobile portal routes per module', () => {
        expect(resolveFeatureFromPath('/production/mobile/tasks')).toEqual({
            featureKey: 'production.mobile.tasks',
            moduleKey: 'production',
            label: 'Tugas Mobile Produksi',
        });
        expect(resolveFeatureFromPath('/production/mobile/tasks/new')).toEqual({
            featureKey: 'production.mobile.tasks',
            moduleKey: 'production',
            label: 'Tugas Mobile Produksi',
        });
        expect(resolveFeatureFromPath('/finance/mobile/insights')).toEqual({
            featureKey: 'finance.mobile.insights',
            moduleKey: 'finance',
            label: 'Insight Mobile Finance',
        });
        expect(resolveFeatureFromPath('/mobile')).toEqual({
            featureKey: 'mobile.hub',
            moduleKey: 'mobile',
            label: 'Pemilih Portal Mobile',
        });
    });

    it('resolves HRD alerts and piece rates', () => {
        expect(resolveFeatureFromPath('/hrd/alerts')?.featureKey).toBe('hrd.alerts');
        expect(resolveFeatureFromPath('/hrd/piece-rates')?.featureKey).toBe('hrd.piece-rates');
    });

    it('resolves sales reports individually', () => {
        expect(resolveFeatureFromPath('/sales/reports/margin')?.featureKey).toBe('sales.reports.margin');
        expect(resolveFeatureFromPath('/sales/pipeline')?.featureKey).toBe('sales.pipeline');
        expect(resolveFeatureFromPath('/sales/orders/so-1/edit')?.featureKey).toBe('sales.orders.edit');
    });

    it('resolves finance operations and edit pages', () => {
        expect(resolveFeatureFromPath('/finance/returns')?.featureKey).toBe('finance.returns.list');
        expect(resolveFeatureFromPath('/finance/returns/r-9')?.featureKey).toBe('finance.returns.detail');
        expect(resolveFeatureFromPath('/finance/rekap-piutang')?.featureKey).toBe('finance.rekap.piutang');
        expect(resolveFeatureFromPath('/finance/journals/j-1/edit')?.featureKey).toBe('finance.journals.edit');
    });

    it('resolves production operations and maklon/distribution', () => {
        expect(resolveFeatureFromPath('/production/daily-report')?.featureKey).toBe('production.daily-report');
        expect(resolveFeatureFromPath('/production/runs/run-7')?.featureKey).toBe('production.runs.detail');
        expect(resolveFeatureFromPath('/warehouse/maklon/receipts')?.featureKey).toBe('warehouse.maklon.receipts');
        expect(resolveFeatureFromPath('/distribution')?.featureKey).toBe('distribution.overview');
    });

    it('has no duplicate feature keys in the registry', () => {
        const features = getAllRegisteredFeatures();
        const keys = features.map((f) => f.featureKey);
        const uniqueKeys = new Set(keys);
        expect(keys.length).toBe(uniqueKeys.size);
    });
});
