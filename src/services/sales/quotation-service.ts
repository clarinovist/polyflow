import { prisma } from '@/lib/core/prisma';
import { SalesOrderStatus, SalesLostReason } from '@prisma/client';
import { logActivity } from '@/lib/tools/audit';
import {
    BusinessRuleError,
    NotFoundError,
    ValidationError,
} from '@/lib/errors/errors';
import {
    SALES_LOST_REASON_LABELS,
    isValidLostReason,
} from '@/lib/sales/order-phase';

// ── Quotation lifecycle actions ──────────────────────────────────────

export async function sendQuotation(id: string, userId: string) {
    const order = await prisma.salesOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('Sales Order', id);
    if (order.status !== SalesOrderStatus.QUOTATION) {
        throw new BusinessRuleError(
            'Only quotations in QUOTATION status can be sent.',
            { status: order.status },
            'INVALID_ORDER_STATUS',
        );
    }

    const updated = await prisma.salesOrder.update({
        where: { id },
        data: {
            status: SalesOrderStatus.QUOTATION_SENT,
            quotationSentAt: new Date(),
        },
    });

    await logActivity({
        userId,
        action: 'QUOTATION_SENT',
        entityType: 'SalesOrder',
        entityId: id,
        details: `Penawaran ${order.orderNumber} dikirim ke customer`,
        fromStatus: order.status,
        toStatus: SalesOrderStatus.QUOTATION_SENT,
    });

    return updated;
}

export async function acceptQuotation(id: string, userId: string) {
    const order = await prisma.salesOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('Sales Order', id);
    if (
        order.status !== SalesOrderStatus.QUOTATION &&
        order.status !== SalesOrderStatus.QUOTATION_SENT
    ) {
        throw new BusinessRuleError(
            'Only QUOTATION or QUOTATION_SENT can be accepted.',
            { status: order.status },
            'INVALID_ORDER_STATUS',
        );
    }

    // Customer must be set before accepting into DRAFT (confirmOrder requires it)
    if (!order.customerId) {
        throw new BusinessRuleError(
            'Lengkapi data customer sebelum menerima penawaran. Customer wajib diisi untuk melanjutkan ke draft order.',
            { orderId: id },
            'CUSTOMER_REQUIRED',
        );
    }

    const updated = await prisma.salesOrder.update({
        where: { id },
        data: { status: SalesOrderStatus.DRAFT },
    });

    await logActivity({
        userId,
        action: 'QUOTATION_ACCEPTED',
        entityType: 'SalesOrder',
        entityId: id,
        details: `Penawaran ${order.orderNumber} diterima → draft order`,
        fromStatus: order.status,
        toStatus: SalesOrderStatus.DRAFT,
    });

    return updated;
}

export async function rejectQuotation(
    id: string,
    userId: string,
    lostReason: SalesLostReason,
    lostReasonNotes?: string,
) {
    if (!lostReason || !isValidLostReason(lostReason)) {
        throw new ValidationError('Alasan kalah wajib dipilih.', {
            field: 'lostReason',
            provided: lostReason as unknown as string,
        });
    }
    if (
        lostReason === SalesLostReason.LAINNYA &&
        (!lostReasonNotes || !lostReasonNotes.trim())
    ) {
        throw new ValidationError('Catatan wajib diisi untuk alasan Lainnya.', {
            field: 'lostReasonNotes',
            lostReason,
        });
    }

    const order = await prisma.salesOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('Sales Order', id);
    if (
        order.status !== SalesOrderStatus.QUOTATION &&
        order.status !== SalesOrderStatus.QUOTATION_SENT
    ) {
        throw new BusinessRuleError(
            'Only QUOTATION or QUOTATION_SENT can be rejected.',
            { status: order.status },
            'INVALID_ORDER_STATUS',
        );
    }

    const humanLabel =
        SALES_LOST_REASON_LABELS[lostReason as string] ?? lostReason;

    const updated = await prisma.salesOrder.update({
        where: { id },
        data: {
            status: SalesOrderStatus.QUOTATION_REJECTED,
            lostReason: lostReason as SalesLostReason,
            lostReasonNotes: lostReasonNotes?.trim() || null,
        },
    });

    await logActivity({
        userId,
        action: 'QUOTATION_REJECTED',
        entityType: 'SalesOrder',
        entityId: id,
        details: `Penawaran ${order.orderNumber} ditolak: ${humanLabel}${lostReasonNotes?.trim() ? ` — ${lostReasonNotes.trim()}` : ''}`,
        fromStatus: order.status,
        toStatus: SalesOrderStatus.QUOTATION_REJECTED,
    });

    return updated;
}

export async function expireQuotation(id: string, userId: string) {
    const order = await prisma.salesOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('Sales Order', id);
    if (
        order.status !== SalesOrderStatus.QUOTATION &&
        order.status !== SalesOrderStatus.QUOTATION_SENT
    ) {
        throw new BusinessRuleError(
            'Only QUOTATION or QUOTATION_SENT can be expired.',
            { status: order.status },
            'INVALID_ORDER_STATUS',
        );
    }

    const updated = await prisma.salesOrder.update({
        where: { id },
        data: { status: SalesOrderStatus.QUOTATION_EXPIRED },
    });

    await logActivity({
        userId,
        action: 'QUOTATION_EXPIRED',
        entityType: 'SalesOrder',
        entityId: id,
        details: `Penawaran ${order.orderNumber} kadarluarsa`,
        fromStatus: order.status,
        toStatus: SalesOrderStatus.QUOTATION_EXPIRED,
    });

    return updated;
}

export async function reopenQuotation(id: string, userId: string) {
    const order = await prisma.salesOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('Sales Order', id);
    if (
        order.status !== SalesOrderStatus.QUOTATION_REJECTED &&
        order.status !== SalesOrderStatus.QUOTATION_EXPIRED
    ) {
        throw new BusinessRuleError(
            'Only REJECTED or EXPIRED quotations can be reopened.',
            { status: order.status },
            'INVALID_ORDER_STATUS',
        );
    }

    const updated = await prisma.salesOrder.update({
        where: { id },
        data: { status: SalesOrderStatus.QUOTATION },
    });

    await logActivity({
        userId,
        action: 'QUOTATION_REOPENED',
        entityType: 'SalesOrder',
        entityId: id,
        details: `Penawaran ${order.orderNumber} dibuka kembali`,
        fromStatus: order.status,
        toStatus: SalesOrderStatus.QUOTATION,
    });

    return updated;
}

/**
 * Update follow-up date for a quotation-phase SO.
 * Only allowed when status is QUOTATION or QUOTATION_SENT.
 * date can be null to clear.
 */
export async function updateFollowUpDate(
    id: string,
    userId: string,
    date: Date | null,
) {
    const order = await prisma.salesOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('Sales Order', id);
    const allowed: string[] = [
        SalesOrderStatus.QUOTATION,
        SalesOrderStatus.QUOTATION_SENT,
    ];
    if (!allowed.includes(order.status as string)) {
        throw new BusinessRuleError(
            'Follow-up hanya bisa diatur saat penawaran masih fase quotation.',
            { status: order.status, orderId: id },
            'INVALID_ORDER_STATUS',
        );
    }

    const updated = await prisma.salesOrder.update({
        where: { id },
        data: { nextFollowUpDate: date },
    });

    await logActivity({
        userId,
        action: 'FOLLOW_UP_SCHEDULED',
        entityType: 'SalesOrder',
        entityId: id,
        details: date
            ? `Jadwal follow-up diatur ke ${date.toISOString().split('T')[0]} untuk ${order.orderNumber}`
            : `Jadwal follow-up dihapus untuk ${order.orderNumber}`,
    });

    return updated;
}

/**
 * Auto-expire all QUOTATION_SENT orders whose validUntil date has passed.
 * Called by cleanup cron API or scheduled jobs.
 */
export async function autoExpireQuotations(): Promise<number> {
    const now = new Date();
    const expiredOrders = await prisma.salesOrder.findMany({
        where: {
            status: SalesOrderStatus.QUOTATION_SENT,
            validUntil: {
                lt: now,
            },
        },
        select: { id: true },
    });

    if (expiredOrders.length === 0) return 0;

    const result = await prisma.salesOrder.updateMany({
        where: {
            id: { in: expiredOrders.map((o) => o.id) },
        },
        data: {
            status: SalesOrderStatus.QUOTATION_EXPIRED,
        },
    });

    return result.count;
}
