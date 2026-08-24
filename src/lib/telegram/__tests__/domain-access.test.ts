import { describe, it, expect } from 'vitest';
import {
    computeAllowedDomains,
    isValidDataDomain,
    VALID_DATA_DOMAINS,
} from '../domain-access';

const base = {
    isSuperAdmin: false,
    role: 'STAFF',
    assignedRoles: [] as string[],
    allowedResources: [] as string[] | 'ALL',
};

describe('computeAllowedDomains — domain price (ADMIN saja)', () => {
    it('memberi price ke superadmin', () => {
        const got = computeAllowedDomains({ ...base, isSuperAdmin: true });
        expect(got.has('price')).toBe(true);
    });

    it('memberi price ke ADMIN lewat field role', () => {
        const got = computeAllowedDomains({ ...base, role: 'ADMIN' });
        expect(got.has('price')).toBe(true);
    });

    it('memberi price ke ADMIN lewat assignedRoles', () => {
        const got = computeAllowedDomains({
            ...base,
            assignedRoles: ['ADMIN'],
        });
        expect(got.has('price')).toBe(true);
    });

    // Ini yang mengunci keputusan user 2026-08-24: harga TIDAK bocor ke sales.
    it('TIDAK memberi price ke SALES walau punya resource /sales', () => {
        const got = computeAllowedDomains({
            ...base,
            role: 'SALES',
            allowedResources: ['/sales'],
        });
        expect(got.has('sales')).toBe(true);
        expect(got.has('price')).toBe(false);
    });

    it('TIDAK memberi price ke MARKETING dengan resource /sales/orders', () => {
        const got = computeAllowedDomains({
            ...base,
            role: 'MARKETING',
            allowedResources: ['/sales/orders'],
        });
        expect(got.has('sales')).toBe(true);
        expect(got.has('price')).toBe(false);
    });

    it('TIDAK memberi price ke role tanpa resource sales', () => {
        const got = computeAllowedDomains({
            ...base,
            role: 'WAREHOUSE',
            allowedResources: ['/warehouse/inventory'],
        });
        expect(got.has('stock')).toBe(true);
        expect(got.has('price')).toBe(false);
    });

    it('memberi price saat allowedResources = ALL (superadmin path)', () => {
        const got = computeAllowedDomains({
            ...base,
            allowedResources: 'ALL',
        });
        expect(got.has('price')).toBe(true);
    });
});

describe('computeAllowedDomains — perilaku domain lain tidak berubah', () => {
    it('ADMIN dapat semua domain', () => {
        const got = computeAllowedDomains({ ...base, role: 'ADMIN' });
        for (const d of VALID_DATA_DOMAINS) {
            expect(got.has(d)).toBe(true);
        }
    });

    it('resource granular dipetakan ke domain yang benar', () => {
        const got = computeAllowedDomains({
            ...base,
            allowedResources: ['/finance/aging', '/purchasing/orders'],
        });
        expect(got.has('finance')).toBe(true);
        expect(got.has('purchasing')).toBe(true);
        expect(got.has('production')).toBe(false);
    });

    it('user tanpa resource sama sekali tidak dapat domain apa pun', () => {
        const got = computeAllowedDomains(base);
        expect(got.size).toBe(0);
    });
});

describe('isValidDataDomain', () => {
    it('menerima price', () => {
        expect(isValidDataDomain('price')).toBe(true);
    });

    it('menerima semua domain di VALID_DATA_DOMAINS', () => {
        for (const d of VALID_DATA_DOMAINS) {
            expect(isValidDataDomain(d)).toBe(true);
        }
    });

    it('menolak domain tak dikenal', () => {
        expect(isValidDataDomain('hrd')).toBe(false);
        expect(isValidDataDomain('')).toBe(false);
        expect(isValidDataDomain('PRICE')).toBe(false);
    });
});
