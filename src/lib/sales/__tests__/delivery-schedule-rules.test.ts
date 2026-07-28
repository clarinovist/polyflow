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
  validateTransportMode,
  validateStopSource,
  canGenerateSJ,
  canRescheduleTrip,
  canCancelTrip,
  canReopenTrip,
  checkSameDayTrips,
  validatePlannedItemQuantity,
  TRANSPORT_MODE_LABELS,
  ACTIVITY_TYPE_LABELS,
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
        { status: 'LINKED' as const, deliveryOrderId: 'do-1', activityType: 'DELIVERY' as const },
        { status: 'GENERATED' as const, deliveryOrderId: 'do-2', activityType: 'DELIVERY' as const },
      ];
      expect(canDepartTrip(stops).ok).toBe(true);
    });
    it('one stop without DO: blocked', () => {
      const stops = [
        { status: 'LINKED' as const, deliveryOrderId: 'do-1', activityType: 'DELIVERY' as const },
        { status: 'PLANNED' as const, deliveryOrderId: null, activityType: 'DELIVERY' as const },
      ];
      const result = canDepartTrip(stops);
      expect(result.ok).toBe(false);
      expect(result.unlinkedCount).toBe(1);
    });
    it('cancelled stops ignored', () => {
      const stops = [
        { status: 'LINKED' as const, deliveryOrderId: 'do-1', activityType: 'DELIVERY' as const },
        { status: 'CANCELLED' as const, deliveryOrderId: null, activityType: 'DELIVERY' as const },
      ];
      expect(canDepartTrip(stops).ok).toBe(true);
    });
    it('empty stops: ok', () => {
      expect(canDepartTrip([]).ok).toBe(true);
    });
    it('backhaul stops without DO: ok', () => {
      const stops = [
        { status: 'PLANNED' as const, deliveryOrderId: null, activityType: 'BACKHAUL' as const },
      ];
      expect(canDepartTrip(stops).ok).toBe(true);
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

  // ============================================
  // Transport Mode Rules
  // ============================================

  describe('validateTransportMode', () => {
    it('INTERNAL_FLEET with vehicle: ok', () => {
      expect(validateTransportMode('INTERNAL_FLEET', 'v-1').ok).toBe(true);
    });
    it('INTERNAL_FLEET without vehicle: blocked', () => {
      const result = validateTransportMode('INTERNAL_FLEET', null);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('wajib');
    });
    it('EXTERNAL_FLEET without vehicle: ok', () => {
      expect(validateTransportMode('EXTERNAL_FLEET', null).ok).toBe(true);
    });
    it('CUSTOMER_PICKUP without vehicle: ok', () => {
      expect(validateTransportMode('CUSTOMER_PICKUP', null).ok).toBe(true);
    });
    it('TBD without vehicle: ok', () => {
      expect(validateTransportMode('TBD', null).ok).toBe(true);
    });
  });

  // ============================================
  // Activity Source Rules
  // ============================================

  describe('validateStopSource', () => {
    it('DELIVERY with SO: ok', () => {
      expect(validateStopSource('DELIVERY', 'so-1', null).ok).toBe(true);
    });
    it('DELIVERY without SO: blocked', () => {
      const result = validateStopSource('DELIVERY', null, null);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Sales Order');
    });
    it('PICKUP_LOAD with SO: ok', () => {
      expect(validateStopSource('PICKUP_LOAD', 'so-1', null).ok).toBe(true);
    });
    it('PICKUP_LOAD with label: ok', () => {
      expect(validateStopSource('PICKUP_LOAD', null, 'Muat ABC').ok).toBe(true);
    });
    it('PICKUP_LOAD without SO or label: blocked', () => {
      const result = validateStopSource('PICKUP_LOAD', null, null);
      expect(result.ok).toBe(false);
    });
    it('BACKHAUL with label: ok', () => {
      expect(validateStopSource('BACKHAUL', null, 'Backhaul dari X').ok).toBe(true);
    });
    it('BACKHAUL without label: blocked', () => {
      const result = validateStopSource('BACKHAUL', null, null);
      expect(result.ok).toBe(false);
    });
    it('OTHER with label: ok', () => {
      expect(validateStopSource('OTHER', null, 'Lainnya').ok).toBe(true);
    });
    it('OTHER without label: blocked', () => {
      const result = validateStopSource('OTHER', null, null);
      expect(result.ok).toBe(false);
    });
  });

  // ============================================
  // SJ Generation
  // ============================================

  describe('canGenerateSJ', () => {
    it('DELIVERY: can generate', () => {
      expect(canGenerateSJ('DELIVERY')).toBe(true);
    });
    it('PICKUP_LOAD: can generate', () => {
      expect(canGenerateSJ('PICKUP_LOAD')).toBe(true);
    });
    it('BACKHAUL: cannot generate', () => {
      expect(canGenerateSJ('BACKHAUL')).toBe(false);
    });
    it('OTHER: cannot generate', () => {
      expect(canGenerateSJ('OTHER')).toBe(false);
    });
  });

  // ============================================
  // Cancel / Reopen / Reschedule Guards
  // ============================================

  describe('canCancelTrip', () => {
    it('PLANNED: allowed', () => {
      expect(canCancelTrip('PLANNED').allowed).toBe(true);
    });
    it('CONFIRMED: allowed', () => {
      expect(canCancelTrip('CONFIRMED').allowed).toBe(true);
    });
    it('DEPARTED: blocked', () => {
      const result = canCancelTrip('DEPARTED');
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('berangkat');
    });
    it('COMPLETED: blocked', () => {
      const result = canCancelTrip('COMPLETED');
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('selesai');
    });
    it('CANCELLED: blocked', () => {
      const result = canCancelTrip('CANCELLED');
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('sudah dibatalkan');
    });
  });

  describe('canReopenTrip', () => {
    it('CONFIRMED: allowed', () => {
      expect(canReopenTrip('CONFIRMED').allowed).toBe(true);
    });
    it('PLANNED: blocked', () => {
      const result = canReopenTrip('PLANNED');
      expect(result.allowed).toBe(false);
    });
    it('DEPARTED: blocked', () => {
      const result = canReopenTrip('DEPARTED');
      expect(result.allowed).toBe(false);
    });
  });

  describe('canRescheduleTrip', () => {
    it('PLANNED: free to change', () => {
      const result = canRescheduleTrip('PLANNED');
      expect(result.allowed).toBe(true);
      expect(result.needsReopen).toBe(false);
    });
    it('CONFIRMED: needs reopen', () => {
      const result = canRescheduleTrip('CONFIRMED');
      expect(result.allowed).toBe(true);
      expect(result.needsReopen).toBe(true);
    });
    it('DEPARTED: blocked', () => {
      const result = canRescheduleTrip('DEPARTED');
      expect(result.allowed).toBe(false);
    });
    it('COMPLETED: blocked', () => {
      const result = canRescheduleTrip('COMPLETED');
      expect(result.allowed).toBe(false);
    });
    it('CANCELLED: blocked', () => {
      const result = canRescheduleTrip('CANCELLED');
      expect(result.allowed).toBe(false);
    });
  });

  // ============================================
  // Multi-trip Same Day
  // ============================================

  describe('checkSameDayTrips', () => {
    const existingTrips = [
      { vehicleId: 'v-1', departureDate: new Date('2026-07-28'), status: 'PLANNED' as const },
    ];

    it('same vehicle same day: warning', () => {
      const result = checkSameDayTrips('v-1', new Date('2026-07-28'), existingTrips);
      expect(result.warning).toBeDefined();
      expect(result.sameDayCount).toBe(1);
    });
    it('different vehicle same day: no warning', () => {
      const result = checkSameDayTrips('v-2', new Date('2026-07-28'), existingTrips);
      expect(result.warning).toBeUndefined();
    });
    it('same vehicle different day: no warning', () => {
      const result = checkSameDayTrips('v-1', new Date('2026-07-29'), existingTrips);
      expect(result.warning).toBeUndefined();
    });
    it('null vehicleId: no warning', () => {
      const result = checkSameDayTrips(null, new Date('2026-07-28'), existingTrips);
      expect(result.warning).toBeUndefined();
    });
    it('null departureDate: no warning', () => {
      const result = checkSameDayTrips('v-1', null, existingTrips);
      expect(result.warning).toBeUndefined();
    });
  });

  // ============================================
  // Planned Item Quantity
  // ============================================

  describe('validatePlannedItemQuantity', () => {
    it('valid quantity: ok', () => {
      const result = validatePlannedItemQuantity(50, 100, 0, 0);
      expect(result.ok).toBe(true);
      expect(result.residual).toBe(100);
    });
    it('zero quantity: blocked', () => {
      const result = validatePlannedItemQuantity(0, 100, 0, 0);
      expect(result.ok).toBe(false);
    });
    it('negative quantity: blocked', () => {
      const result = validatePlannedItemQuantity(-10, 100, 0, 0);
      expect(result.ok).toBe(false);
    });
    it('exceeds residual: blocked', () => {
      const result = validatePlannedItemQuantity(150, 100, 0, 0);
      expect(result.ok).toBe(false);
      expect(result.residual).toBe(100);
    });
    it('accounts for delivered qty', () => {
      const result = validatePlannedItemQuantity(30, 100, 50, 0);
      expect(result.ok).toBe(true);
      expect(result.residual).toBe(50);
    });
    it('accounts for other planned qty', () => {
      const result = validatePlannedItemQuantity(20, 100, 0, 80);
      expect(result.ok).toBe(true);
      expect(result.residual).toBe(20);
    });
  });

  // ============================================
  // Labels
  // ============================================

  describe('labels', () => {
    it('TRANSPORT_MODE_LABELS has all modes', () => {
      expect(TRANSPORT_MODE_LABELS.INTERNAL_FLEET).toBeDefined();
      expect(TRANSPORT_MODE_LABELS.EXTERNAL_FLEET).toBeDefined();
      expect(TRANSPORT_MODE_LABELS.CUSTOMER_PICKUP).toBeDefined();
      expect(TRANSPORT_MODE_LABELS.TBD).toBeDefined();
    });
    it('ACTIVITY_TYPE_LABELS has all types', () => {
      expect(ACTIVITY_TYPE_LABELS.DELIVERY).toBeDefined();
      expect(ACTIVITY_TYPE_LABELS.PICKUP_LOAD).toBeDefined();
      expect(ACTIVITY_TYPE_LABELS.BACKHAUL).toBeDefined();
      expect(ACTIVITY_TYPE_LABELS.OTHER).toBeDefined();
    });
  });
});
