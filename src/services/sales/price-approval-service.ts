'use strict';

import { prisma } from '@/lib/core/prisma';
import {
    BusinessRuleError,
    NotFoundError,
    ValidationError,
} from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';

/**
 * Approve price: PENDING → PROVISIONAL.
 * FINAL only happens inside confirmOrder on success — never here.
 * Throws if not PENDING (double-approve / already FINAL guard).
 */
export async function approvePrice(
    orderId: string,
    approverId: string,
    notes?: string,
) {
    const order = await prisma.salesOrder.findUnique({
        where: { id: orderId },
        select: {
            id: true,
            orderNumber: true,
            priceStatus: true,
            status: true,
        },
    });

    if (!order) throw new NotFoundError('Sales Order', orderId);

    if (order.priceStatus !== 'PENDING') {
        throw new BusinessRuleError(
            order.priceStatus == null
                ? 'Order ini tidak memiliki status harga yang menunggu persetujuan.'
                : `Harga tidak bisa di-approve — status saat ini ${order.priceStatus}. Hanya PENDING yang bisa di-approve.`,
            { orderId, currentPriceStatus: order.priceStatus },
            'PRICE_APPROVAL_INVALID_STATUS',
        );
    }

    const updated = await prisma.salesOrder.update({
        where: { id: orderId },
        data: { priceStatus: 'PROVISIONAL' },
    });

    await logActivity({
        userId: approverId,
        action: 'PRICE_APPROVED',
        entityType: 'SalesOrder',
        entityId: orderId,
        details:
            notes?.trim() ||
            `Harga untuk ${order.orderNumber} disetujui → sementara (PROVISIONAL).`,
        fromStatus: order.priceStatus,
        toStatus: 'PROVISIONAL',
    });

    return updated;
}

/**
 * Reject price: keeps PENDING, records audit log with mandatory notes.
 * SO status itself is NOT changed — sales must fix prices then request re-approval.
 */
export async function rejectPrice(
    orderId: string,
    approverId: string,
    notes?: string,
) {
    if (!notes?.trim()) {
        throw new ValidationError('Alasan penolakan harga wajib diisi.');
    }

    const order = await prisma.salesOrder.findUnique({
        where: { id: orderId },
        select: {
            id: true,
            orderNumber: true,
            priceStatus: true,
            status: true,
        },
    });

    if (!order) throw new NotFoundError('Sales Order', orderId);

    if (order.priceStatus !== 'PENDING') {
        throw new BusinessRuleError(
            `Harga tidak bisa ditolak — status saat ini ${order.priceStatus ?? 'null'}. Hanya PENDING yang bisa ditolak.`,
            { orderId, currentPriceStatus: order.priceStatus },
            'PRICE_REJECTION_INVALID_STATUS',
        );
    }

    // Intentionally does NOT change priceStatus — stays PENDING.
    // Record rejection in audit log.
    await logActivity({
        userId: approverId,
        action: 'PRICE_REJECTED',
        entityType: 'SalesOrder',
        entityId: orderId,
        details: `Harga untuk ${order.orderNumber} ditolak: ${notes.trim()}`,
        fromStatus: order.priceStatus,
        toStatus: 'PENDING',
    });

    // Return current order row (unchanged priceStatus) for convenience
    return prisma.salesOrder.findUnique({ where: { id: orderId } });
}
