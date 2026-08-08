import { describe, it, expect } from 'vitest';
import {
  decideRunTerminalPatch,
  type OrderTerminalSnapshot,
} from '../routing-run-terminal';

// Mirrors the 7 required cases from docs/plan/2026-08-08-fix-routing-run-lifecycle-gaps.md
// §6, applied to this shared decision function instead of testing
// syncProductionRunStatusFromOrders directly (already covered in
// routing-execution-guard.test.ts, which now delegates to this same
// function). Both call sites MUST agree — that's the entire point of
// having one function instead of two copies of the branching.
describe('decideRunTerminalPatch', () => {
  it('[case 1] mixed COMPLETED + CANCELLED -> COMPLETED with actualEndDate = max(actualEndDate)', () => {
    const earlier = new Date('2026-08-01T08:00:00Z');
    const later = new Date('2026-08-01T10:00:00Z');
    const orders: OrderTerminalSnapshot[] = [
      { status: 'COMPLETED', actualEndDate: earlier },
      { status: 'COMPLETED', actualEndDate: later },
      { status: 'CANCELLED', actualEndDate: null },
    ];
    const decision = decideRunTerminalPatch(orders);
    expect(decision).toEqual({ kind: 'COMPLETED', actualEndDate: later });
  });

  it('[case 2 — regression] all CANCELLED -> CANCELLED, not COMPLETED', () => {
    const orders: OrderTerminalSnapshot[] = [
      { status: 'CANCELLED', actualEndDate: null },
      { status: 'CANCELLED', actualEndDate: null },
    ];
    expect(decideRunTerminalPatch(orders)).toEqual({ kind: 'CANCELLED' });
  });

  it('[case 3] one IN_PROGRESS + rest terminal -> NO_OP (run stays as-is)', () => {
    const orders: OrderTerminalSnapshot[] = [
      { status: 'COMPLETED', actualEndDate: new Date('2026-08-01T09:00:00Z') },
      { status: 'CANCELLED', actualEndDate: null },
      { status: 'IN_PROGRESS', actualEndDate: null },
    ];
    const decision = decideRunTerminalPatch(orders);
    expect(decision.kind).toBe('NO_OP');
  });

  it('all COMPLETED -> COMPLETED with actualEndDate = max(actualEndDate)', () => {
    const earlier = new Date('2026-08-01T08:00:00Z');
    const later = new Date('2026-08-01T09:30:00Z');
    const orders: OrderTerminalSnapshot[] = [
      { status: 'COMPLETED', actualEndDate: later },
      { status: 'COMPLETED', actualEndDate: earlier },
    ];
    expect(decideRunTerminalPatch(orders)).toEqual({
      kind: 'COMPLETED',
      actualEndDate: later,
    });
  });

  it('all terminal but no order ever recorded actualEndDate -> COMPLETED with actualEndDate null (caller applies the "now" fallback)', () => {
    const orders: OrderTerminalSnapshot[] = [
      { status: 'COMPLETED', actualEndDate: null },
      { status: 'CANCELLED', actualEndDate: null },
    ];
    expect(decideRunTerminalPatch(orders)).toEqual({
      kind: 'COMPLETED',
      actualEndDate: null,
    });
  });

  it('run with no orders -> NO_OP (matches syncProductionRunStatusFromOrders early return)', () => {
    expect(decideRunTerminalPatch([]).kind).toBe('NO_OP');
  });

  it('all RELEASED (nothing terminal yet) -> NO_OP', () => {
    const orders: OrderTerminalSnapshot[] = [
      { status: 'RELEASED', actualEndDate: null },
      { status: 'RELEASED', actualEndDate: null },
    ];
    expect(decideRunTerminalPatch(orders).kind).toBe('NO_OP');
  });
});
