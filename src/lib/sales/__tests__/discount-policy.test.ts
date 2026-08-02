import { describe, it, expect } from 'vitest';
import { checkDiscountCeiling } from '../discount-policy';

describe('checkDiscountCeiling', () => {
    it('no ceiling at all → always allowed (backward compat)', () => {
        const r = checkDiscountCeiling({
            discountPercent: 99,
            customerCeiling: null,
            tenantCeiling: null,
        });
        expect(r.allowed).toBe(true);
        expect(r.appliedCeiling).toBeNull();
        expect(r.exceededBy).toBe(0);
    });

    it('below tenant ceiling → allowed', () => {
        const r = checkDiscountCeiling({
            discountPercent: 5,
            customerCeiling: null,
            tenantCeiling: 10,
        });
        expect(r.allowed).toBe(true);
        expect(r.appliedCeiling).toBe(10);
        expect(r.exceededBy).toBe(0);
    });

    it('exactly at ceiling → allowed (inclusive boundary)', () => {
        const r = checkDiscountCeiling({
            discountPercent: 10,
            customerCeiling: null,
            tenantCeiling: 10,
        });
        expect(r.allowed).toBe(true);
        expect(r.exceededBy).toBe(0);
        expect(r.appliedCeiling).toBe(10);
    });

    it('above tenant ceiling → not allowed, exceededBy correct', () => {
        const r = checkDiscountCeiling({
            discountPercent: 15,
            customerCeiling: null,
            tenantCeiling: 10,
        });
        expect(r.allowed).toBe(false);
        expect(r.appliedCeiling).toBe(10);
        expect(r.exceededBy).toBe(5);
    });

    it('customer override wins over tenant ceiling', () => {
        // customer = 20, tenant = 5 → applied = 20, discount 10 allowed
        const r1 = checkDiscountCeiling({
            discountPercent: 10,
            customerCeiling: 20,
            tenantCeiling: 5,
        });
        expect(r1.allowed).toBe(true);
        expect(r1.appliedCeiling).toBe(20);

        // discount 25 > customer 20 → not allowed even though tenant lower
        const r2 = checkDiscountCeiling({
            discountPercent: 25,
            customerCeiling: 20,
            tenantCeiling: 5,
        });
        expect(r2.allowed).toBe(false);
        expect(r2.appliedCeiling).toBe(20);
        expect(r2.exceededBy).toBe(5);
    });

    it('customer ceiling null fallback to tenant ceiling', () => {
        const r = checkDiscountCeiling({
            discountPercent: 7,
            customerCeiling: null,
            tenantCeiling: 10,
        });
        expect(r.appliedCeiling).toBe(10);
        expect(r.allowed).toBe(true);
    });

    it('only customer ceiling — tenant null', () => {
        const allowed = checkDiscountCeiling({
            discountPercent: 8,
            customerCeiling: 8,
            tenantCeiling: null,
        });
        expect(allowed.allowed).toBe(true);
        expect(allowed.appliedCeiling).toBe(8);

        const exceeded = checkDiscountCeiling({
            discountPercent: 9,
            customerCeiling: 8,
            tenantCeiling: null,
        });
        expect(exceeded.allowed).toBe(false);
        expect(exceeded.exceededBy).toBe(1);
    });

    it('zero discount with zero ceiling → allowed', () => {
        const r = checkDiscountCeiling({
            discountPercent: 0,
            customerCeiling: 0,
            tenantCeiling: null,
        });
        expect(r.allowed).toBe(true);
        expect(r.appliedCeiling).toBe(0);
    });

    it('exceededBy precision for decimal', () => {
        const r = checkDiscountCeiling({
            discountPercent: 12.5,
            customerCeiling: 10,
            tenantCeiling: null,
        });
        expect(r.allowed).toBe(false);
        expect(r.exceededBy).toBeCloseTo(2.5);
    });
});
