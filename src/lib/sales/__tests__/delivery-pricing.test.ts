import { describe, it, expect } from 'vitest';
import {
  normalizeKey,
  normalizeRouteKey,
  routesMatch,
  customersMatch,
  resolveBestTariff,
  computeDeliveryTotals,
  isBillableDeliveryStatus,
  sumBillableCharges,
} from '../delivery-pricing';

describe('delivery-pricing', () => {
  // ── normalizeKey ──────────────────────────────────────

  describe('normalizeKey', () => {
    it('returns null for null', () => {
      expect(normalizeKey(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(normalizeKey(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(normalizeKey('')).toBeNull();
    });

    it('returns null for whitespace-only', () => {
      expect(normalizeKey('   ')).toBeNull();
    });

    it('trims and returns non-empty string', () => {
      expect(normalizeKey('  cust-123  ')).toBe('cust-123');
    });
  });

  // ── normalizeRouteKey ──────────────────────────────────────

  describe('normalizeRouteKey', () => {
    it('returns null for null', () => {
      expect(normalizeRouteKey(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(normalizeRouteKey(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(normalizeRouteKey('')).toBeNull();
    });

    it('returns null for whitespace-only', () => {
      expect(normalizeRouteKey('   ')).toBeNull();
    });

    it('trims and returns non-empty string', () => {
      expect(normalizeRouteKey('  Solo–Semarang  ')).toBe('Solo–Semarang');
    });

    it('preserves case', () => {
      expect(normalizeRouteKey('solo')).toBe('solo');
      expect(normalizeRouteKey('SOLO')).toBe('SOLO');
    });
  });

  // ── routesMatch ────────────────────────────────────────────

  describe('routesMatch', () => {
    it('null matches null (both Semua Rute)', () => {
      expect(routesMatch(null, null)).toBe(true);
    });

    it('undefined matches null', () => {
      expect(routesMatch(undefined, null)).toBe(true);
    });

    it('empty string matches null', () => {
      expect(routesMatch('', null)).toBe(true);
    });

    it('whitespace matches null', () => {
      expect(routesMatch('   ', null)).toBe(true);
    });

    it('exact match after trim', () => {
      expect(routesMatch('Solo–Semarang', ' Solo–Semarang ')).toBe(true);
    });

    it('does not match different routes', () => {
      expect(routesMatch('Solo–Semarang', 'Solo–Boyolali')).toBe(false);
    });

    it('does not match route vs null', () => {
      expect(routesMatch('Solo–Semarang', null)).toBe(false);
    });
  });

  // ── computeDeliveryTotals ──────────────────────────────────

  describe('computeDeliveryTotals', () => {
    describe('FLAT_RATE', () => {
      it('returns costRate and chargeRate directly', () => {
        const result = computeDeliveryTotals({
          rateType: 'FLAT_RATE',
          costRate: 100000,
          chargeRate: 150000,
        });
        expect(result).toEqual({
          totalCost: 100000,
          totalCharge: 150000,
          billableKg: null,
        });
      });

      it('ignores weight and minKg for FLAT_RATE', () => {
        const result = computeDeliveryTotals({
          rateType: 'FLAT_RATE',
          costRate: 100000,
          chargeRate: 150000,
          weightKg: 500,
          minKg: 100,
        });
        expect(result.totalCost).toBe(100000);
        expect(result.totalCharge).toBe(150000);
        expect(result.billableKg).toBeNull();
      });

      it('handles zero rates', () => {
        const result = computeDeliveryTotals({
          rateType: 'FLAT_RATE',
          costRate: 0,
          chargeRate: 0,
        });
        expect(result).toEqual({
          totalCost: 0,
          totalCharge: 0,
          billableKg: null,
        });
      });
    });

    describe('PER_KG', () => {
      it('computes from weight when provided', () => {
        const result = computeDeliveryTotals({
          rateType: 'PER_KG',
          costRate: 500,
          chargeRate: 750,
          weightKg: 1000,
        });
        expect(result).toEqual({
          totalCost: 500000,
          totalCharge: 750000,
          billableKg: 1000,
        });
      });

      it('uses minKg when weight is lower', () => {
        const result = computeDeliveryTotals({
          rateType: 'PER_KG',
          costRate: 500,
          chargeRate: 750,
          weightKg: 50,
          minKg: 100,
        });
        expect(result).toEqual({
          totalCost: 50000,
          totalCharge: 75000,
          billableKg: 100,
        });
      });

      it('uses weight when weight is higher than minKg', () => {
        const result = computeDeliveryTotals({
          rateType: 'PER_KG',
          costRate: 500,
          chargeRate: 750,
          weightKg: 200,
          minKg: 100,
        });
        expect(result.billableKg).toBe(200);
        expect(result.totalCost).toBe(100000);
        expect(result.totalCharge).toBe(150000);
      });

      it('uses minKg when weight is null', () => {
        const result = computeDeliveryTotals({
          rateType: 'PER_KG',
          costRate: 500,
          chargeRate: 750,
          weightKg: null,
          minKg: 100,
        });
        expect(result.billableKg).toBe(100);
        expect(result.totalCost).toBe(50000);
      });

      it('uses minKg when weight is 0', () => {
        const result = computeDeliveryTotals({
          rateType: 'PER_KG',
          costRate: 500,
          chargeRate: 750,
          weightKg: 0,
          minKg: 100,
        });
        expect(result.billableKg).toBe(100);
      });

      it('returns 0 totals when both weight and minKg are 0/null', () => {
        const result = computeDeliveryTotals({
          rateType: 'PER_KG',
          costRate: 500,
          chargeRate: 750,
          weightKg: null,
          minKg: null,
        });
        expect(result).toEqual({
          totalCost: 0,
          totalCharge: 0,
          billableKg: 0,
        });
      });

      it('returns 0 totals when weight and minKg are both 0', () => {
        const result = computeDeliveryTotals({
          rateType: 'PER_KG',
          costRate: 500,
          chargeRate: 750,
          weightKg: 0,
          minKg: 0,
        });
        expect(result).toEqual({
          totalCost: 0,
          totalCharge: 0,
          billableKg: 0,
        });
      });

      it('rounds to 2 decimal places', () => {
        const result = computeDeliveryTotals({
          rateType: 'PER_KG',
          costRate: 333.33,
          chargeRate: 555.55,
          weightKg: 100,
        });
        expect(result.totalCost).toBe(33333);
        expect(result.totalCharge).toBe(55555);
      });

      it('handles fractional weight correctly', () => {
        const result = computeDeliveryTotals({
          rateType: 'PER_KG',
          costRate: 1000,
          chargeRate: 1500,
          weightKg: 33.33,
        });
        expect(result.totalCost).toBe(33330);
        expect(result.totalCharge).toBe(49995);
        expect(result.billableKg).toBe(33.33);
      });
    });
  });

  // ── isBillableDeliveryStatus ───────────────────────────────

  describe('isBillableDeliveryStatus', () => {
    it('returns true for all non-CANCELLED statuses', () => {
      const billable = [
        'PENDING', 'LOADING', 'SHIPPED', 'IN_TRANSIT',
        'ARRIVED', 'DELIVERED', 'RETURNED',
      ];
      for (const status of billable) {
        expect(isBillableDeliveryStatus(status)).toBe(true);
      }
    });

    it('returns false for CANCELLED', () => {
      expect(isBillableDeliveryStatus('CANCELLED')).toBe(false);
    });
  });

  // ── sumBillableCharges ─────────────────────────────────────

  describe('sumBillableCharges', () => {
    it('sums non-cancelled deliveries', () => {
      const result = sumBillableCharges([
        { status: 'DELIVERED', totalCharge: 100000 },
        { status: 'SHIPPED', totalCharge: 50000 },
      ]);
      expect(result).toBe(150000);
    });

    it('excludes CANCELLED deliveries', () => {
      const result = sumBillableCharges([
        { status: 'DELIVERED', totalCharge: 100000 },
        { status: 'CANCELLED', totalCharge: 50000 },
      ]);
      expect(result).toBe(100000);
    });

    it('includes RETURNED deliveries (per decision A2)', () => {
      const result = sumBillableCharges([
        { status: 'DELIVERED', totalCharge: 100000 },
        { status: 'RETURNED', totalCharge: 50000 },
      ]);
      expect(result).toBe(150000);
    });

    it('skips entries with null totalCharge', () => {
      const result = sumBillableCharges([
        { status: 'DELIVERED', totalCharge: 100000 },
        { status: 'PENDING', totalCharge: null },
      ]);
      expect(result).toBe(100000);
    });

    it('skips entries with undefined totalCharge', () => {
      const result = sumBillableCharges([
        { status: 'DELIVERED', totalCharge: 100000 },
        { status: 'PENDING', totalCharge: undefined },
      ]);
      expect(result).toBe(100000);
    });

    it('returns 0 for empty array', () => {
      expect(sumBillableCharges([])).toBe(0);
    });

    it('returns 0 when all are cancelled', () => {
      const result = sumBillableCharges([
        { status: 'CANCELLED', totalCharge: 100000 },
        { status: 'CANCELLED', totalCharge: 50000 },
      ]);
      expect(result).toBe(0);
    });

    it('handles mixed null and real charges', () => {
      const result = sumBillableCharges([
        { status: 'DELIVERED', totalCharge: 100000 },
        { status: 'SHIPPED', totalCharge: null },
        { status: 'CANCELLED', totalCharge: 999999 },
        { status: 'RETURNED', totalCharge: 25000 },
      ]);
      expect(result).toBe(125000);
    });
  });

  // ── customersMatch ─────────────────────────────────────

  describe('customersMatch', () => {
    it('null matches null', () => {
      expect(customersMatch(null, null)).toBe(true);
    });

    it('undefined matches null', () => {
      expect(customersMatch(undefined, null)).toBe(true);
    });

    it('empty string matches null', () => {
      expect(customersMatch('', null)).toBe(true);
    });

    it('whitespace matches null', () => {
      expect(customersMatch('   ', null)).toBe(true);
    });

    it('exact match after trim', () => {
      expect(customersMatch('cust-123', ' cust-123 ')).toBe(true);
    });

    it('does not match different customers', () => {
      expect(customersMatch('cust-1', 'cust-2')).toBe(false);
    });

    it('does not match customer vs null', () => {
      expect(customersMatch('cust-1', null)).toBe(false);
    });
  });

  // ── resolveBestTariff ──────────────────────────────────

  describe('resolveBestTariff', () => {
    it('returns undefined for empty candidates', () => {
      expect(resolveBestTariff([], { routeName: 'Solo', customerId: 'c1' })).toBeUndefined();
    });

    it('tier 1: customer match + route match wins', () => {
      const t1 = { customerId: 'c1', routeName: 'Solo' };
      const t2 = { customerId: null, routeName: 'Solo' };
      const t3 = { customerId: 'c1', routeName: null };
      expect(resolveBestTariff([t2, t3, t1], { routeName: 'Solo', customerId: 'c1' })).toBe(t1);
    });

    it('tier 2: customer match + route null beats tier 3/4', () => {
      const t1 = { customerId: null, routeName: 'Solo' };
      const t2 = { customerId: 'c1', routeName: null };
      expect(resolveBestTariff([t1, t2], { routeName: 'Solo', customerId: 'c1' })).toBe(t2);
    });

    it('tier 3: customer null + route match beats tier 4', () => {
      const t1 = { customerId: null, routeName: 'Solo' };
      const t2 = { customerId: null, routeName: null };
      expect(resolveBestTariff([t2, t1], { routeName: 'Solo', customerId: 'c1' })).toBe(t1);
    });

    it('tier 4: default (both null) when nothing else matches', () => {
      const t1 = { customerId: null, routeName: null };
      expect(resolveBestTariff([t1], { routeName: 'Solo', customerId: 'c1' })).toBe(t1);
    });

    it('no match returns undefined when all candidates have non-matching customer', () => {
      const t1 = { customerId: 'c2', routeName: 'Solo' };
      expect(resolveBestTariff([t1], { routeName: 'Solo', customerId: 'c1' })).toBeUndefined();
    });

    it('no match returns undefined when all candidates have non-matching route', () => {
      const t1 = { customerId: 'c1', routeName: 'Boyolali' };
      expect(resolveBestTariff([t1], { routeName: 'Solo', customerId: 'c1' })).toBeUndefined();
    });

    it('route name exact match after trim', () => {
      const t1 = { customerId: null, routeName: 'Solo' };
      const t2 = { customerId: null, routeName: null };
      expect(resolveBestTariff([t2, t1], { routeName: 'Solo', customerId: null })).toBe(t1);
    });

    it('customerId exact match', () => {
      const t1 = { customerId: 'c1', routeName: null };
      expect(resolveBestTariff([t1], { routeName: 'Solo', customerId: 'c1' })).toBe(t1);
    });

    it('first candidate wins within same tier (ordered by validFrom desc)', () => {
      const t1 = { customerId: null, routeName: 'Solo', id: 'newer' };
      const t2 = { customerId: null, routeName: 'Solo', id: 'older' };
      expect(resolveBestTariff([t1, t2], { routeName: 'Solo', customerId: null })).toBe(t1);
    });

    it('customer-specific tariff picks tier 1 over tier 2', () => {
      const t1 = { customerId: 'c1', routeName: null };
      const t2 = { customerId: 'c1', routeName: 'Solo' };
      expect(resolveBestTariff([t1, t2], { routeName: 'Solo', customerId: 'c1' })).toBe(t2);
    });

    it('customer-specific tariff picks tier 2 when no route match exists', () => {
      const t1 = { customerId: 'c1', routeName: null };
      expect(resolveBestTariff([t1], { routeName: 'Solo', customerId: 'c1' })).toBe(t1);
    });

    it('no customerId provided falls back to tier 3/4', () => {
      const t1 = { customerId: 'c1', routeName: 'Solo' };
      const t2 = { customerId: null, routeName: 'Solo' };
      expect(resolveBestTariff([t1, t2], { routeName: 'Solo', customerId: null })).toBe(t2);
    });

    it('no routeName provided falls back to tier 2/4', () => {
      const t1 = { customerId: 'c1', routeName: 'Solo' };
      const t2 = { customerId: 'c1', routeName: null };
      expect(resolveBestTariff([t1, t2], { routeName: null, customerId: 'c1' })).toBe(t2);
    });

    it('both null input and null candidate fields is tier 4', () => {
      const t1 = { customerId: null, routeName: null };
      expect(resolveBestTariff([t1], { routeName: null, customerId: null })).toBe(t1);
    });
  });
});
