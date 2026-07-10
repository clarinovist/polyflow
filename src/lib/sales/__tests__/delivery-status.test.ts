import { describe, it, expect } from 'vitest';
import {
  canTransition,
  DELIVERY_TRANSITIONS,
  getDeliveryStatusLabel,
  OPEN_DELIVERY_STATUSES,
  TERMINAL_DELIVERY_STATUSES,
  NEXT_STEP_LABELS,
} from '../delivery-status';

describe('delivery-status', () => {
  describe('canTransition', () => {
    it('allows PENDING → LOADING', () => {
      expect(canTransition('PENDING', 'LOADING')).toBe(true);
    });

    it('allows PENDING → SHIPPED', () => {
      expect(canTransition('PENDING', 'SHIPPED')).toBe(true);
    });

    it('allows PENDING → CANCELLED', () => {
      expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
    });

    it('allows LOADING → SHIPPED', () => {
      expect(canTransition('LOADING', 'SHIPPED')).toBe(true);
    });

    it('allows LOADING → CANCELLED', () => {
      expect(canTransition('LOADING', 'CANCELLED')).toBe(true);
    });

    it('allows SHIPPED → IN_TRANSIT', () => {
      expect(canTransition('SHIPPED', 'IN_TRANSIT')).toBe(true);
    });

    it('allows SHIPPED → ARRIVED', () => {
      expect(canTransition('SHIPPED', 'ARRIVED')).toBe(true);
    });

    it('allows SHIPPED → DELIVERED', () => {
      expect(canTransition('SHIPPED', 'DELIVERED')).toBe(true);
    });

    it('allows SHIPPED → RETURNED', () => {
      expect(canTransition('SHIPPED', 'RETURNED')).toBe(true);
    });

    it('allows IN_TRANSIT → ARRIVED', () => {
      expect(canTransition('IN_TRANSIT', 'ARRIVED')).toBe(true);
    });

    it('allows IN_TRANSIT → DELIVERED', () => {
      expect(canTransition('IN_TRANSIT', 'DELIVERED')).toBe(true);
    });

    it('allows IN_TRANSIT → RETURNED', () => {
      expect(canTransition('IN_TRANSIT', 'RETURNED')).toBe(true);
    });

    it('allows ARRIVED → DELIVERED', () => {
      expect(canTransition('ARRIVED', 'DELIVERED')).toBe(true);
    });

    it('allows ARRIVED → RETURNED', () => {
      expect(canTransition('ARRIVED', 'RETURNED')).toBe(true);
    });

    it('rejects PENDING → DELIVERED (skip)', () => {
      expect(canTransition('PENDING', 'DELIVERED')).toBe(false);
    });

    it('rejects PENDING → IN_TRANSIT', () => {
      expect(canTransition('PENDING', 'IN_TRANSIT')).toBe(false);
    });

    it('rejects DELIVERED → anything', () => {
      for (const target of Object.keys(DELIVERY_TRANSITIONS)) {
        expect(canTransition('DELIVERED', target)).toBe(false);
      }
    });

    it('rejects RETURNED → anything', () => {
      for (const target of Object.keys(DELIVERY_TRANSITIONS)) {
        expect(canTransition('RETURNED', target)).toBe(false);
      }
    });

    it('rejects CANCELLED → anything', () => {
      for (const target of Object.keys(DELIVERY_TRANSITIONS)) {
        expect(canTransition('CANCELLED', target)).toBe(false);
      }
    });

    it('rejects unknown source status', () => {
      expect(canTransition('UNKNOWN', 'DELIVERED')).toBe(false);
    });
  });

  describe('OPEN_DELIVERY_STATUSES', () => {
    it('includes non-terminal statuses', () => {
      expect(OPEN_DELIVERY_STATUSES).toContain('PENDING');
      expect(OPEN_DELIVERY_STATUSES).toContain('LOADING');
      expect(OPEN_DELIVERY_STATUSES).toContain('SHIPPED');
      expect(OPEN_DELIVERY_STATUSES).toContain('IN_TRANSIT');
      expect(OPEN_DELIVERY_STATUSES).toContain('ARRIVED');
    });

    it('excludes terminal statuses', () => {
      expect(OPEN_DELIVERY_STATUSES).not.toContain('DELIVERED');
      expect(OPEN_DELIVERY_STATUSES).not.toContain('RETURNED');
      expect(OPEN_DELIVERY_STATUSES).not.toContain('CANCELLED');
    });
  });

  describe('TERMINAL_DELIVERY_STATUSES', () => {
    it('includes DELIVERED, RETURNED, CANCELLED', () => {
      expect(TERMINAL_DELIVERY_STATUSES).toContain('DELIVERED');
      expect(TERMINAL_DELIVERY_STATUSES).toContain('RETURNED');
      expect(TERMINAL_DELIVERY_STATUSES).toContain('CANCELLED');
    });
  });

  describe('getDeliveryStatusLabel', () => {
    it('returns Indonesian labels for all statuses', () => {
      expect(getDeliveryStatusLabel('PENDING')).toBe('Menunggu');
      expect(getDeliveryStatusLabel('LOADING')).toBe('Sedang Dimuat');
      expect(getDeliveryStatusLabel('SHIPPED')).toBe('Dikirim');
      expect(getDeliveryStatusLabel('IN_TRANSIT')).toBe('Dalam Perjalanan');
      expect(getDeliveryStatusLabel('ARRIVED')).toBe('Sampai Tujuan');
      expect(getDeliveryStatusLabel('DELIVERED')).toBe('Terkirim');
      expect(getDeliveryStatusLabel('RETURNED')).toBe('Diretur');
      expect(getDeliveryStatusLabel('CANCELLED')).toBe('Dibatalkan');
    });

    it('returns raw status for unknown', () => {
      expect(getDeliveryStatusLabel('UNKNOWN')).toBe('UNKNOWN');
    });
  });

  describe('NEXT_STEP_LABELS', () => {
    it('has correct next step for each non-terminal status', () => {
      expect(NEXT_STEP_LABELS.PENDING).toEqual({ to: 'LOADING', label: 'Mulai Muat' });
      expect(NEXT_STEP_LABELS.LOADING).toEqual({ to: 'SHIPPED', label: 'Tandai Dikirim' });
      expect(NEXT_STEP_LABELS.SHIPPED).toEqual({ to: 'IN_TRANSIT', label: 'Dalam Perjalanan' });
      expect(NEXT_STEP_LABELS.IN_TRANSIT).toEqual({ to: 'ARRIVED', label: 'Sampai Tujuan' });
      expect(NEXT_STEP_LABELS.ARRIVED).toEqual({ to: 'DELIVERED', label: 'Tandai Terkirim' });
    });

    it('returns null for terminal statuses', () => {
      expect(NEXT_STEP_LABELS.DELIVERED).toBeNull();
      expect(NEXT_STEP_LABELS.RETURNED).toBeNull();
      expect(NEXT_STEP_LABELS.CANCELLED).toBeNull();
    });
  });
});
