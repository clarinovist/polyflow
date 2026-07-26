/**
 * Sales Order phase / status helpers.
 * Pure helpers — no DB, no side effects. Fully testable.
 *
 * After unified SO + quotation lifecycle migration,
 * SalesOrderStatus gains: QUOTATION, QUOTATION_SENT, QUOTATION_REJECTED, QUOTATION_EXPIRED.
 * These helpers abstract over the expanded enum so consumers don't hardcode arrays.
 */

import type { SalesOrderStatus } from '@prisma/client';

// ── Status sets ─────────────────────────────────────────────────

/**
 * Quotation-phase statuses — the document is a commercial offer, not yet an operational order.
 */
export const QUOTATION_STATUSES: readonly SalesOrderStatus[] = [
    'QUOTATION',
    'QUOTATION_SENT',
    'QUOTATION_REJECTED',
    'QUOTATION_EXPIRED',
] as const;

/**
 * Pre-confirm statuses: quotation phases + DRAFT.
 * Orders in these statuses have not yet committed to operations.
 */
export const PRE_CONFIRM_STATUSES: readonly SalesOrderStatus[] = [
    ...QUOTATION_STATUSES,
    'DRAFT',
] as const;

/**
 * Operational statuses — order is confirmed and moving through fulfillment.
 */
export const OPERATIONAL_STATUSES: readonly SalesOrderStatus[] = [
    'CONFIRMED',
    'IN_PRODUCTION',
    'READY_TO_SHIP',
    'SHIPPED',
    'DELIVERED',
] as const;

/**
 * Terminal statuses — no further transitions expected (except optional reopen for quotation).
 */
export const TERMINAL_STATUSES: readonly SalesOrderStatus[] = [
    'QUOTATION_REJECTED',
    'QUOTATION_EXPIRED',
    'CANCELLED',
] as const;

/**
 * Statuses that count toward revenue / omzet in reports.
 * Only operational delivered/shipped statuses (existing report rules).
 */
export const REVENUE_STATUSES: readonly SalesOrderStatus[] = [
    'SHIPPED',
    'DELIVERED',
] as const;

// ── Phase predicates ────────────────────────────────────────────

/** Is this order still in the commercial/quotation phase? */
export function isQuotationPhase(status: SalesOrderStatus): boolean {
    return (QUOTATION_STATUSES as readonly SalesOrderStatus[]).includes(status);
}

/** Is this order in a pre-confirm state (quotation or draft)? */
export function isPreConfirm(status: SalesOrderStatus): boolean {
    return (PRE_CONFIRM_STATUSES as readonly SalesOrderStatus[]).includes(
        status,
    );
}

/** Is this order in an operational (confirmed+) phase? */
export function isOperational(status: SalesOrderStatus): boolean {
    return (OPERATIONAL_STATUSES as readonly SalesOrderStatus[]).includes(
        status,
    );
}

/** Is this status terminal (no outgoing transitions)? */
export function isTerminal(status: SalesOrderStatus): boolean {
    return (TERMINAL_STATUSES as readonly SalesOrderStatus[]).includes(status);
}

// ── Action gates ────────────────────────────────────────────────

/** Can this order be confirmed? Only DRAFT (existing gate, preserved). */
export function canConfirm(status: SalesOrderStatus): boolean {
    return status === 'DRAFT';
}

/** Can a delivery order be created from this status? */
export function canCreateDelivery(status: SalesOrderStatus): boolean {
    return isOperational(status);
}

/** Can an invoice be created from this status? */
export function canCreateInvoice(status: SalesOrderStatus): boolean {
    return isOperational(status);
}

/** Can items / price / customer be edited? */
export function canEdit(status: SalesOrderStatus): boolean {
    return (
        status === 'QUOTATION' ||
        status === 'QUOTATION_SENT' ||
        status === 'DRAFT'
    );
}

/** Can a quotation be sent to the customer? */
export function canSendQuotation(status: SalesOrderStatus): boolean {
    return status === 'QUOTATION';
}

/** Can a quotation be accepted (→ DRAFT)? */
export function canAcceptQuotation(status: SalesOrderStatus): boolean {
    return status === 'QUOTATION' || status === 'QUOTATION_SENT';
}

/** Can a rejected/expired quotation be reopened? */
export function canReopenQuotation(status: SalesOrderStatus): boolean {
    return status === 'QUOTATION_REJECTED' || status === 'QUOTATION_EXPIRED';
}

/** Should this order be excluded from omzet / revenue reports? */
export function countsTowardRevenue(status: SalesOrderStatus): boolean {
    return (REVENUE_STATUSES as readonly SalesOrderStatus[]).includes(status);
}

/** Should this order appear in FG Demand Board? */
export function appearsInFGDemand(status: SalesOrderStatus): boolean {
    return isOperational(status);
}

// ── Transition maps ─────────────────────────────────────────────

/**
 * Allowed outgoing transitions per status.
 * Quotation-terminal (REJECTED, EXPIRED) can reopen to QUOTATION with permission.
 */
export const ORDER_TRANSITIONS: Record<string, readonly SalesOrderStatus[]> = {
    QUOTATION: ['QUOTATION_SENT', 'DRAFT', 'CANCELLED'],
    QUOTATION_SENT: [
        'DRAFT',
        'QUOTATION_REJECTED',
        'QUOTATION_EXPIRED',
        'CANCELLED',
    ],
    QUOTATION_REJECTED: ['QUOTATION'], // reopen only
    QUOTATION_EXPIRED: ['QUOTATION'], // reopen only
    DRAFT: ['CONFIRMED', 'IN_PRODUCTION', 'CANCELLED'],
    CONFIRMED: ['IN_PRODUCTION', 'CANCELLED'],
    IN_PRODUCTION: ['READY_TO_SHIP', 'CANCELLED'],
    READY_TO_SHIP: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED', 'CANCELLED'],
    DELIVERED: [],
    CANCELLED: [],
} as const;

/**
 * Check if a status transition is allowed.
 */
export function canTransition(
    from: SalesOrderStatus,
    to: SalesOrderStatus,
): boolean {
    return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Labels (Bahasa Indonesia) ───────────────────────────────────

export const ORDER_PHASE_LABELS: Record<string, string> = {
    QUOTATION: 'Penawaran',
    QUOTATION_SENT: 'Penawaran Dikirim',
    QUOTATION_REJECTED: 'Ditolak',
    QUOTATION_EXPIRED: 'Kadarluarsa',
    DRAFT: 'Draft',
    CONFIRMED: 'Dikonfirmasi',
    IN_PRODUCTION: 'Diproduksi',
    READY_TO_SHIP: 'Siap Kirim',
    SHIPPED: 'Dikirim',
    DELIVERED: 'Selesai',
    CANCELLED: 'Dibatalkan',
};

/**
 * Get human-readable label for an order phase.
 */
export function getOrderPhaseLabel(status: SalesOrderStatus): string {
    return ORDER_PHASE_LABELS[status] ?? status;
}

// ── Pipeline helpers (for field CRM) ──────────────────────────────

/**
 * Statuses visible in the field pipeline view — open quotation + active orders.
 */
export const PIPELINE_STATUSES: readonly SalesOrderStatus[] = [
    'QUOTATION',
    'QUOTATION_SENT',
    'DRAFT',
    'CONFIRMED',
    'IN_PRODUCTION',
    'READY_TO_SHIP',
] as const;

/** Is this order visible in the field pipeline? */
export function isPipeline(status: SalesOrderStatus): boolean {
    return (PIPELINE_STATUSES as readonly SalesOrderStatus[]).includes(status);
}

/**
 * Statuses for "needs follow-up" — open quotation with no recent activity.
 */
export const FOLLOW_UP_STATUSES: readonly SalesOrderStatus[] = [
    'QUOTATION',
    'QUOTATION_SENT',
] as const;

/** Should this order appear in "needs follow-up"? */
export function needsFollowUp(status: SalesOrderStatus): boolean {
    return (FOLLOW_UP_STATUSES as readonly SalesOrderStatus[]).includes(status);
}
