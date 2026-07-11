import { describe, it, expect } from 'vitest';
import {
  normalizeScheduleStatus,
  canTransitionSchedule,
  canActivateSchedule,
  canCloseSchedule,
  canTransitionTrip,
  canDepartTrip,
  validateDepartureInWeek,
  canRemoveTrip,
  isSOSchedulable,
  isDOAlreadyAssigned,
  validateStopHasSource,
  canEditStop,
  canRemoveStop,
  isDuplicateTrip,
  checkCapacity,
  isSOMultiStop,
} from '../delivery-schedule-rules';

describe('delivery-schedule-rules', () => {
  // ============================================
  // Schedule Header
  // ============================================

  describe('normalizeScheduleStatus', () => {
    it('DRAFT stays DRAFT', () => {
      expect(normalizeScheduleStatus('DRAFT')).toBe('DRAFT');
    });
    it('ACTIVE stays ACTIVE', () => {
      expect(normalizeScheduleStatus('ACTIVE')).toBe('ACTIVE');
    });
    it('CLOSED stays CLOSED', () => {
      expect(normalizeScheduleStatus('CLOSED')).toBe('CLOSED');
    });
    it('legacy CONFIRMED maps to ACTIVE', () => {
      expect(normalizeScheduleStatus('CONFIRMED')).toBe('ACTIVE');
    });
    it('legacy IN_TRANSIT maps to ACTIVE', () => {
      expect(normalizeScheduleStatus('IN_TRANSIT')).toBe('ACTIVE');
    });
    it('legacy COMPLETED maps to CLOSED', () => {
      expect(normalizeScheduleStatus('COMPLETED')).toBe('CLOSED');
    });
  });

  describe('canTransitionSchedule', () => {
    it('DRAFT → ACTIVE allowed', () => {
      expect(canTransitionSchedule('DRAFT', 'ACTIVE')).toBe(true);
    });
    it('ACTIVE → CLOSED allowed', () => {
      expect(canTransitionSchedule('ACTIVE', 'CLOSED')).toBe(true);
    });
    it('CLOSED → ACTIVE allowed (reopen)', () => {
      expect(canTransitionSchedule('CLOSED', 'ACTIVE')).toBe(true);
    });
    it('DRAFT → CLOSED blocked', () => {
      expect(canTransitionSchedule('DRAFT', 'CLOSED')).toBe(false);
    });
    it('legacy CONFIRMED → CLOSED allowed (via normalization)', () => {
      expect(canTransitionSchedule('CONFIRMED', 'CLOSED')).toBe(true);
    });
    it('legacy DRAFT → legacy CONFIRMED allowed (maps to DRAFT→ACTIVE)', () => {
      expect(canTransitionSchedule('DRAFT', 'CONFIRMED')).toBe(true);
    });
  });

  describe('canActivateSchedule', () => {
    it('0 trips: ok with warning', () => {
      const result = canActivateSchedule(0);
      expect(result.ok).toBe(true);
      expect(result.warning).toBeDefined();
    });
    it('1 trip: ok without warning', () => {
      const result = canActivateSchedule(1);
      expect(result.ok).toBe(true);
      expect(result.warning).toBeUndefined();
    });
    it('3 trips: ok', () => {
      expect(canActivateSchedule(3).ok).toBe(true);
    });
  });

  describe('canCloseSchedule', () => {
    it('all trips COMPLETED: ok', () => {
      expect(canCloseSchedule([{ status: 'COMPLETED' }, { status: 'COMPLETED' }]).ok).toBe(true);
    });
    it('mix COMPLETED + CANCELLED: ok', () => {
      expect(canCloseSchedule([{ status: 'COMPLETED' }, { status: 'CANCELLED' }]).ok).toBe(true);
    });
    it('one PLANNED trip: blocked', () => {
      const result = canCloseSchedule([{ status: 'COMPLETED' }, { status: 'PLANNED' }]);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('1 trip');
    });
    it('DEPARTED trip: blocked', () => {
      const result = canCloseSchedule([{ status: 'DEPARTED' }]);
      expect(result.ok).toBe(false);
    });
  });

  // ============================================
  // Trip
  // ============================================

  describe('canTransitionTrip', () => {
    it('PLANNED → CONFIRMED', () => {
      expect(canTransitionTrip('PLANNED', 'CONFIRMED')).toBe(true);
    });
    it('PLANNED → CANCELLED', () => {
      expect(canTransitionTrip('PLANNED', 'CANCELLED')).toBe(true);
    });
    it('CONFIRMED → DEPARTED', () => {
      expect(canTransitionTrip('CONFIRMED', 'DEPARTED')).toBe(true);
    });
    it('CONFIRMED → PLANNED (unconfirm)', () => {
      expect(canTransitionTrip('CONFIRMED', 'PLANNED')).toBe(true);
    });
    it('DEPARTED → COMPLETED', () => {
      expect(canTransitionTrip('DEPARTED', 'COMPLETED')).toBe(true);
    });
    it('DEPARTED → PLANNED blocked', () => {
      expect(canTransitionTrip('DEPARTED', 'PLANNED')).toBe(false);
    });
    it('COMPLETED → anything blocked', () => {
      expect(canTransitionTrip('COMPLETED', 'PLANNED')).toBe(false);
      expect(canTransitionTrip('COMPLETED', 'CANCELLED')).toBe(false);
    });
    it('CANCELLED → anything blocked', () => {
      expect(canTransitionTrip('CANCELLED', 'PLANNED')).toBe(false);
    });
  });

  describe('canDepartTrip', () => {
    it('all stops have DO: ok', () => {
      const stops = [
        { status: 'LINKED' as const, deliveryOrderId: 'do-1' },
        { status: 'GENERATED' as const, deliveryOrderId: 'do-2' },
      ];
      expect(canDepartTrip(stops).ok).toBe(true);
    });
    it('one stop without DO: blocked', () => {
      const stops = [
        { status: 'LINKED' as const, deliveryOrderId: 'do-1' },
        { status: 'PLANNED' as const, deliveryOrderId: null },
      ];
      const result = canDepartTrip(stops);
      expect(result.ok).toBe(false);
      expect(result.unlinkedCount).toBe(1);
    });
    it('cancelled stops ignored', () => {
      const stops = [
        { status: 'LINKED' as const, deliveryOrderId: 'do-1' },
        { status: 'CANCELLED' as const, deliveryOrderId: null },
      ];
      expect(canDepartTrip(stops).ok).toBe(true);
    });
    it('empty stops: ok', () => {
      expect(canDepartTrip([]).ok).toBe(true);
    });
  });

  describe('validateDepartureInWeek', () => {
    const weekStart = new Date('2026-07-06'); // Monday
    const weekEnd = new Date('2026-07-12');   // Sunday

    it('date within week: ok', () => {
      const dep = new Date('2026-07-08'); // Wednesday
      expect(validateDepartureInWeek(dep, weekStart, weekEnd).ok).toBe(true);
    });
    it('date = Monday: ok', () => {
      expect(validateDepartureInWeek(new Date('2026-07-06'), weekStart, weekEnd).ok).toBe(true);
    });
    it('date = Sunday: ok', () => {
      expect(validateDepartureInWeek(new Date('2026-07-12'), weekStart, weekEnd).ok).toBe(true);
    });
    it('date before week: blocked', () => {
      const result = validateDepartureInWeek(new Date('2026-07-05'), weekStart, weekEnd);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('di luar');
    });
    it('date after week: blocked', () => {
      const result = validateDepartureInWeek(new Date('2026-07-13'), weekStart, weekEnd);
      expect(result.ok).toBe(false);
    });
    it('null date: blocked', () => {
      const result = validateDepartureInWeek(null, weekStart, weekEnd);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('wajib');
    });
  });

  describe('canRemoveTrip', () => {
    it('PLANNED trip: ok', () => {
      expect(canRemoveTrip('PLANNED', []).ok).toBe(true);
    });
    it('CANCELLED trip: ok', () => {
      expect(canRemoveTrip('CANCELLED', []).ok).toBe(true);
    });
    it('CONFIRMED trip with no active stops: ok', () => {
      expect(canRemoveTrip('CONFIRMED', [{ status: 'CANCELLED' }]).ok).toBe(true);
    });
    it('CONFIRMED trip with active stops: blocked', () => {
      const result = canRemoveTrip('CONFIRMED', [{ status: 'LINKED' }]);
      expect(result.ok).toBe(false);
    });
    it('DEPARTED trip with stops: blocked', () => {
      const result = canRemoveTrip('DEPARTED', [{ status: 'GENERATED' }]);
      expect(result.ok).toBe(false);
    });
  });

  // ============================================
  // Stop
  // ============================================

  describe('isSOSchedulable', () => {
    it('CONFIRMED SO: schedulable', () => {
      expect(isSOSchedulable('CONFIRMED')).toBe(true);
    });
    it('IN_PROGRESS SO: schedulable', () => {
      expect(isSOSchedulable('IN_PROGRESS')).toBe(true);
    });
    it('DRAFT SO: not schedulable', () => {
      expect(isSOSchedulable('DRAFT')).toBe(false);
    });
    it('CANCELLED SO: not schedulable', () => {
      expect(isSOSchedulable('CANCELLED')).toBe(false);
    });
  });

  describe('isDOAlreadyAssigned', () => {
    const stops = [
      { id: 's1', deliveryOrderId: 'do-1', status: 'LINKED' as const },
      { id: 's2', deliveryOrderId: 'do-2', status: 'PLANNED' as const },
      { id: 's3', deliveryOrderId: 'do-3', status: 'CANCELLED' as const },
    ];

    it('DO already linked: true', () => {
      expect(isDOAlreadyAssigned('do-1', stops)).toBe(true);
    });
    it('DO not found: false', () => {
      expect(isDOAlreadyAssigned('do-99', stops)).toBe(false);
    });
    it('DO in cancelled stop: false', () => {
      expect(isDOAlreadyAssigned('do-3', stops)).toBe(false);
    });
  });

  describe('validateStopHasSource', () => {
    it('has salesOrderId: ok', () => {
      expect(validateStopHasSource('so-1', null).ok).toBe(true);
    });
    it('has deliveryOrderId: ok', () => {
      expect(validateStopHasSource(null, 'do-1').ok).toBe(true);
    });
    it('has both: ok', () => {
      expect(validateStopHasSource('so-1', 'do-1').ok).toBe(true);
    });
    it('has neither: blocked', () => {
      const result = validateStopHasSource(null, null);
      expect(result.ok).toBe(false);
    });
  });

  describe('canEditStop', () => {
    it('trip PLANNED: any stop editable', () => {
      expect(canEditStop('PLANNED', 'LINKED')).toBe(true);
      expect(canEditStop('PLANNED', 'PLANNED')).toBe(true);
    });
    it('trip CONFIRMED + stop PLANNED: editable', () => {
      expect(canEditStop('CONFIRMED', 'PLANNED')).toBe(true);
    });
    it('trip CONFIRMED + stop LINKED: not editable', () => {
      expect(canEditStop('CONFIRMED', 'LINKED')).toBe(false);
    });
    it('trip DEPARTED: nothing editable', () => {
      expect(canEditStop('DEPARTED', 'PLANNED')).toBe(false);
    });
  });

  describe('canRemoveStop', () => {
    it('PLANNED stop: delete', () => {
      expect(canRemoveStop('PLANNED').action).toBe('delete');
    });
    it('LINKED stop: cancel with warning', () => {
      const result = canRemoveStop('LINKED');
      expect(result.action).toBe('cancel');
      expect(result.warning).toBeDefined();
    });
    it('GENERATED stop: cancel with warning', () => {
      expect(canRemoveStop('GENERATED').action).toBe('cancel');
    });
  });

  // ============================================
  // Capacity & Multi-trip
  // ============================================

  describe('isDuplicateTrip', () => {
    const existingTrips = [
      { vehicleId: 'v1', departureDate: new Date('2026-07-08'), status: 'PLANNED' as const },
    ];

    it('same vehicle + same date: blocked', () => {
      const result = isDuplicateTrip('v1', new Date('2026-07-08'), existingTrips);
      expect(result.blocked).toBe(true);
    });
    it('same vehicle + different date: ok', () => {
      const result = isDuplicateTrip('v1', new Date('2026-07-09'), existingTrips);
      expect(result.blocked).toBe(false);
    });
    it('different vehicle + same date: ok', () => {
      const result = isDuplicateTrip('v2', new Date('2026-07-08'), existingTrips);
      expect(result.blocked).toBe(false);
    });
    it('null departure date: not blocked', () => {
      const result = isDuplicateTrip('v1', null, existingTrips);
      expect(result.blocked).toBe(false);
    });
    it('cancelled trip ignored', () => {
      const trips = [
        { vehicleId: 'v1', departureDate: new Date('2026-07-08'), status: 'CANCELLED' as const },
      ];
      const result = isDuplicateTrip('v1', new Date('2026-07-08'), trips);
      expect(result.blocked).toBe(false);
    });
  });

  describe('checkCapacity', () => {
    it('under capacity: ok, no warning', () => {
      const result = checkCapacity(800, 1000);
      expect(result.ok).toBe(true);
      expect(result.warning).toBeUndefined();
      expect(result.utilizationPct).toBe(80);
    });
    it('over capacity: ok with warning (soft)', () => {
      const result = checkCapacity(1200, 1000);
      expect(result.ok).toBe(true); // soft warning, not hard block
      expect(result.warning).toContain('melebihi');
      expect(result.utilizationPct).toBe(120);
    });
    it('null capacity: ok, no warning', () => {
      const result = checkCapacity(5000, null);
      expect(result.ok).toBe(true);
      expect(result.warning).toBeUndefined();
    });
    it('zero capacity: ok, no warning', () => {
      const result = checkCapacity(5000, 0);
      expect(result.ok).toBe(true);
    });
  });

  describe('isSOMultiStop', () => {
    const stops = [
      { salesOrderId: 'so-1', status: 'PLANNED' as const },
      { salesOrderId: 'so-2', status: 'LINKED' as const },
    ];

    it('SO already assigned: true', () => {
      expect(isSOMultiStop('so-1', stops)).toBe(true);
    });
    it('SO not found: false', () => {
      expect(isSOMultiStop('so-99', stops)).toBe(false);
    });
    it('cancelled stop ignored', () => {
      const stopsWithCancelled = [
        { salesOrderId: 'so-1', status: 'CANCELLED' as const },
      ];
      expect(isSOMultiStop('so-1', stopsWithCancelled)).toBe(false);
    });
  });
});
