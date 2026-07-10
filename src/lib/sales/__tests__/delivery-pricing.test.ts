import { describe, it, expect } from 'vitest';
import {
  normalizeRouteKey,
  routesMatch,
  computeDeliveryTotals,
  isBillableDeliveryStatus,
  sumBillableCharges,
} from '../delivery-pricing';

describe('delivery-pricing', () => {
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
});
