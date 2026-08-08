/**
 * Single source of truth for deciding whether a ProductionRun should become
 * terminal (COMPLETED / CANCELLED) given the current statuses of its orders.
 *
 * Two callers share this exact logic — neither keeps its own copy:
 *   - `syncProductionRunStatusFromOrders`
 *     (src/services/production/routing-execution-guard.ts) — the live G1
 *     fix, called whenever an order's status changes.
 *   - `scripts/patch-stuck-routing-runs.ts` — the one-off backfill
 *     (docs/plan/2026-08-08-fix-routing-run-lifecycle-gaps.md §4.3) for runs
 *     that got stuck before the G1 fix shipped and won't self-heal (the
 *     live sync only runs on an order status change).
 *
 * Kept as a pure module (no Prisma, no I/O) deliberately: it lives under
 * src/ so it is actually typechecked and linted by CI (unlike scripts/**,
 * which both tsconfig.json and eslint.config.mjs exclude), and so it can be
 * unit tested directly.
 */

export type OrderTerminalSnapshot = {
    status: string;
    actualEndDate: Date | null;
};

export type RunTerminalPatchDecision =
    | { kind: 'NO_OP'; reason: string }
    | { kind: 'CANCELLED' }
    | { kind: 'COMPLETED'; actualEndDate: Date | null };

const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED']);

/**
 * Decide what a run's status should be, given a snapshot of its orders.
 * Branch order matters: allCancelled is checked BEFORE the general
 * allTerminal case, so a run whose orders are all CANCELLED is never
 * misclassified as COMPLETED.
 *
 * Name kept as `decideRunTerminalPatch` (not renamed to something more
 * neutral like `decideRunTerminalStatus`) so `scripts/patch-stuck-routing-runs.ts`
 * only needed its import path updated when this module moved from
 * scripts/lib/ to here — not its call site.
 */
export function decideRunTerminalPatch(
    orders: OrderTerminalSnapshot[],
): RunTerminalPatchDecision {
    if (orders.length === 0) {
        return { kind: 'NO_OP', reason: 'run has no orders' };
    }

    const allTerminal = orders.every((o) => TERMINAL_STATUSES.has(o.status));
    if (!allTerminal) {
        return { kind: 'NO_OP', reason: 'not all orders are terminal yet' };
    }

    const allCancelled = orders.every((o) => o.status === 'CANCELLED');
    if (allCancelled) {
        return { kind: 'CANCELLED' };
    }

    // Mixed COMPLETED + CANCELLED, or all COMPLETED — same branch: at least
    // one order actually finished, so the run finished. actualEndDate is the
    // latest of whatever orders recorded one; null if none did. Callers decide
    // their own "now" fallback for that case (see
    // syncProductionRunStatusFromOrders's `?? opts?.completedAt ?? new Date()`
    // and patch-stuck-routing-runs.ts's `?? new Date()`) — this function stays
    // pure/deterministic given its input.
    const endDates = orders
        .map((o) => o.actualEndDate)
        .filter((d): d is Date => d != null);
    const actualEndDate =
        endDates.length > 0
            ? new Date(Math.max(...endDates.map((d) => d.getTime())))
            : null;

    return { kind: 'COMPLETED', actualEndDate };
}
