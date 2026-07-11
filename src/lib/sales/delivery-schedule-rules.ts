/**
 * Delivery Schedule Planning Rules — pure helpers, no DB, no side effects.
 *
 * Covers: Schedule header, Trip, Stop status machines + validation rules.
 * Fully unit-testable.
 */

import type { ScheduleStatus, TripStatus, ScheduleStopStatus } from '@prisma/client';

// ============================================
// Schedule Header Status Machine
// ============================================

/**
 * Normalize legacy status values to new semantic values.
 * Opsi X: keep legacy enum values in DB, map in app layer.
 */
export function normalizeScheduleStatus(status: ScheduleStatus): 'DRAFT' | 'ACTIVE' | 'CLOSED' {
  switch (status) {
    case 'DRAFT':
      return 'DRAFT';
    case 'ACTIVE':
    case 'CONFIRMED':
    case 'IN_TRANSIT':
      return 'ACTIVE';
    case 'CLOSED':
    case 'COMPLETED':
      return 'CLOSED';
    default:
      return 'DRAFT';
  }
}

/**
 * Allowed header status transitions (using new semantic values).
 */
const SCHEDULE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['CLOSED'],
  CLOSED: [], // reopen → ACTIVE is phase 2
};

/**
 * Check if a schedule header status transition is allowed.
 * Input: raw DB status values. Normalizes before checking.
 */
export function canTransitionSchedule(from: ScheduleStatus, to: ScheduleStatus): boolean {
  const fromNorm = normalizeScheduleStatus(from);
  const toNorm = normalizeScheduleStatus(to);
  return SCHEDULE_TRANSITIONS[fromNorm]?.includes(toNorm) ?? false;
}

/**
 * Guard: DRAFT → ACTIVE.
 * R-H3: minimal 0 trip OK (soft warning), preferred ≥1.
 */
export function canActivateSchedule(tripCount: number): { ok: boolean; warning?: string } {
  if (tripCount === 0) {
    return { ok: true, warning: 'Jadwal belum memiliki trip. Disarankan minimal 1 trip sebelum mengaktifkan.' };
  }
  return { ok: true };
}

/**
 * Guard: ACTIVE → CLOSED.
 * R-H4: semua trip harus terminal (COMPLETED | CANCELLED).
 */
export function canCloseSchedule(
  trips: Array<{ status: TripStatus }>
): { ok: boolean; error?: string } {
  const nonTerminal = trips.filter(
    (t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
  );
  if (nonTerminal.length > 0) {
    return {
      ok: false,
      error: `Tidak bisa menutup jadwal: masih ada ${nonTerminal.length} trip yang belum selesai.`,
    };
  }
  return { ok: true };
}

// ============================================
// Trip Status Machine
// ============================================

/**
 * Allowed trip status transitions.
 */
const TRIP_TRANSITIONS: Record<string, string[]> = {
  PLANNED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['DEPARTED', 'PLANNED', 'CANCELLED'],
  DEPARTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * Check if a trip status transition is allowed.
 */
export function canTransitionTrip(from: TripStatus, to: TripStatus): boolean {
  return TRIP_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Guard: trip → DEPARTED.
 * R-T6/A9: semua stop non-cancelled harus punya deliveryOrderId.
 */
export function canDepartTrip(
  stops: Array<{ status: ScheduleStopStatus; deliveryOrderId: string | null }>
): { ok: boolean; error?: string; unlinkedCount: number } {
  const activeStops = stops.filter((s) => s.status !== 'CANCELLED');
  const unlinked = activeStops.filter((s) => !s.deliveryOrderId);
  if (unlinked.length > 0) {
    return {
      ok: false,
      error: `Tidak bisa berangkat: ${unlinked.length} stop belum memiliki Surat Jalan. Buat atau link SJ terlebih dahulu.`,
      unlinkedCount: unlinked.length,
    };
  }
  return { ok: true, unlinkedCount: 0 };
}

/**
 * Guard: trip → CONFIRMED.
 * R-T1: departureDate harus dalam [weekStart, weekEnd].
 */
export function validateDepartureInWeek(
  departureDate: Date | null,
  weekStart: Date,
  weekEnd: Date
): { ok: boolean; error?: string } {
  if (!departureDate) {
    return { ok: false, error: 'Tanggal berangkat wajib diisi sebelum konfirmasi.' };
  }
  const dep = new Date(departureDate);
  dep.setHours(0, 0, 0, 0);
  const ws = new Date(weekStart);
  ws.setHours(0, 0, 0, 0);
  const we = new Date(weekEnd);
  we.setHours(23, 59, 59, 999);

  if (dep < ws || dep > we) {
    return {
      ok: false,
      error: `Tanggal berangkat ${dep.toLocaleDateString('id-ID')} di luar rentang minggu (${ws.toLocaleDateString('id-ID')} – ${we.toLocaleDateString('id-ID')}).`,
    };
  }
  return { ok: true };
}

/**
 * Guard: remove trip.
 * R-T7: hanya jika PLANNED/CANCELLED atau tidak ada stop aktif.
 */
export function canRemoveTrip(
  tripStatus: TripStatus,
  stops: Array<{ status: ScheduleStopStatus }>
): { ok: boolean; error?: string } {
  if (tripStatus === 'PLANNED' || tripStatus === 'CANCELLED') {
    return { ok: true };
  }
  const activeStops = stops.filter((s) => s.status !== 'CANCELLED');
  if (activeStops.length > 0) {
    return {
      ok: false,
      error: `Tidak bisa menghapus trip dengan status ${tripStatus} yang masih memiliki ${activeStops.length} stop aktif.`,
    };
  }
  return { ok: true };
}

// ============================================
// Stop (Plan Item) Rules
// ============================================

/**
 * R-S1: Check if a Sales Order is eligible for scheduling.
 * SO must not be DRAFT or CANCELLED.
 */
export function isSOSchedulable(soStatus: string): boolean {
  return soStatus !== 'DRAFT' && soStatus !== 'CANCELLED';
}

/**
 * R-S3: Check if a DO is already assigned to an active stop.
 * Returns true if duplicate (should block).
 */
export function isDOAlreadyAssigned(
  deliveryOrderId: string,
  existingStops: Array<{ id: string; deliveryOrderId: string | null; status: ScheduleStopStatus }>
): boolean {
  return existingStops.some(
    (s) => s.deliveryOrderId === deliveryOrderId && s.status !== 'CANCELLED'
  );
}

/**
 * Integrity: at least one of salesOrderId or deliveryOrderId must be set.
 */
export function validateStopHasSource(
  salesOrderId: string | null | undefined,
  deliveryOrderId: string | null | undefined
): { ok: boolean; error?: string } {
  if (!salesOrderId && !deliveryOrderId) {
    return {
      ok: false,
      error: 'Stop harus memiliki Sales Order atau Surat Jalan.',
    };
  }
  return { ok: true };
}

/**
 * R-S6: Check if a stop can be edited based on trip + stop status.
 */
export function canEditStop(
  tripStatus: TripStatus,
  stopStatus: ScheduleStopStatus
): boolean {
  if (tripStatus === 'PLANNED') return true;
  if (tripStatus === 'CONFIRMED' && stopStatus === 'PLANNED') return true;
  return false;
}

/**
 * R-S5: Check if removing/cancelling a stop is safe.
 * LINKED/GENERATED stops: only cancel, don't auto-delete DO.
 */
export function canRemoveStop(
  stopStatus: ScheduleStopStatus
): { action: 'delete' | 'cancel'; warning?: string } {
  if (stopStatus === 'PLANNED') {
    return { action: 'delete' };
  }
  // LINKED or GENERATED: cancel instead of delete, warn about DO
  return {
    action: 'cancel',
    warning: 'Stop ini terkait Surat Jalan. Stop akan dibatalkan, tapi SJ tetap ada.',
  };
}

// ============================================
// Capacity & Multi-trip Validation
// ============================================

/**
 * R-T2: Check if same vehicle + same date is blocked per schedule.
 * MVP: block exact same vehicleId + departureDate (date-only).
 */
export function isDuplicateTrip(
  vehicleId: string,
  departureDate: Date | null,
  existingTrips: Array<{ vehicleId: string; departureDate: Date | null; status: TripStatus }>
): { blocked: boolean; conflictTrip?: string } {
  if (!departureDate) return { blocked: false };

  const depDateStr = new Date(departureDate).toDateString();
  const conflict = existingTrips.find(
    (t) =>
      t.vehicleId === vehicleId &&
      t.departureDate &&
      new Date(t.departureDate).toDateString() === depDateStr &&
      t.status !== 'CANCELLED'
  );

  if (conflict) {
    return {
      blocked: true,
      conflictTrip: `Kendaraan sudah dijadwalkan pada tanggal yang sama (trip ${conflict.status}).`,
    };
  }
  return { blocked: false };
}

/**
 * R-T3: Capacity soft warning.
 * Σ stop.plannedWeightKg vs vehicle.capacityKg.
 */
export function checkCapacity(
  totalPlannedKg: number,
  vehicleCapacityKg: number | null
): { ok: boolean; warning?: string; utilizationPct: number } {
  if (!vehicleCapacityKg || vehicleCapacityKg <= 0) {
    return { ok: true, utilizationPct: 0 };
  }
  const pct = (totalPlannedKg / vehicleCapacityKg) * 100;
  if (totalPlannedKg > vehicleCapacityKg) {
    return {
      ok: true, // soft warning, not hard block
      warning: `Total berat rencana (${totalPlannedKg.toLocaleString('id-ID')} kg) melebihi kapasitas kendaraan (${vehicleCapacityKg.toLocaleString('id-ID')} kg).`,
      utilizationPct: pct,
    };
  }
  return { ok: true, utilizationPct: pct };
}

/**
 * R-S4: Soft warning if SO is assigned to multiple stops (partial plan).
 */
export function isSOMultiStop(
  salesOrderId: string,
  existingStops: Array<{ salesOrderId: string | null; status: ScheduleStopStatus }>
): boolean {
  return existingStops.some(
    (s) => s.salesOrderId === salesOrderId && s.status !== 'CANCELLED'
  );
}

// ============================================
// Status Labels (Bahasa Indonesia)
// ============================================

export const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Aktif',
  CLOSED: 'Selesai',
  // Legacy
  CONFIRMED: 'Aktif',
  IN_TRANSIT: 'Aktif',
  COMPLETED: 'Selesai',
};

export const TRIP_STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Direncanakan',
  CONFIRMED: 'Dikonfirmasi',
  DEPARTED: 'Berangkat',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export const STOP_STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Belum SJ',
  LINKED: 'Ada SJ',
  GENERATED: 'Ada SJ',
  CANCELLED: 'Batal',
};

/**
 * Status badge color hints for UI.
 */
export const SCHEDULE_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'muted',
  ACTIVE: 'blue',
  CLOSED: 'green',
  CONFIRMED: 'blue',
  IN_TRANSIT: 'blue',
  COMPLETED: 'green',
};

export const TRIP_STATUS_COLORS: Record<string, string> = {
  PLANNED: 'muted',
  CONFIRMED: 'blue',
  DEPARTED: 'amber',
  COMPLETED: 'green',
  CANCELLED: 'red',
};

export const STOP_STATUS_COLORS: Record<string, string> = {
  PLANNED: 'orange',
  LINKED: 'green',
  GENERATED: 'green',
  CANCELLED: 'red',
};
