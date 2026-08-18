/**
 * Delivery Reversal Service
 *
 * Reverses a SHIPPED Delivery Order back to CANCELLED: undoes the stock OUT
 * movements, decrements deliveredQty, voids the draft/unpaid invoice(s),
 * restores consumed reservations, and reopens the Sales Order.
 *
 * Mirrors the void pattern already proven on the production side —
 * src/services/production/execution-void-helper.ts — rather than inventing a
 * new reversal architecture. See docs/plan/2026-08-18-reverse-delivery-shipment.md.
 */

import {
    DeliveryStatus,
    MovementType,
    ReservationStatus,
    ReservationType,
    SalesOrderStatus,
} from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { AccountingService } from '@/services/accounting/accounting-service';
import { updateInvoiceStatus } from '@/services/finance/invoice-lifecycle-service';
import { isPeriodOpen } from '@/services/accounting/periods-service';
import { logActivity } from '@/lib/tools/audit';

const REVERSAL_PREFIX = 'VOID: ';
const RESERVATION_HOLD_DAYS = 7;

function sourceMarker(deliveryOrderId: string) {
    return `[SOURCE:${deliveryOrderId}]`;
}

export interface ReverseDeliveryShipmentResult {
    success: boolean;
    reversedLines: number;
}

export async function reverseDeliveryShipment(
    deliveryOrderId: string,
    userId: string,
    reason: string,
): Promise<ReverseDeliveryShipmentResult> {
    return prisma.$transaction(
        async (tx) => {
            const doRecord = await tx.deliveryOrder.findUnique({
                where: { id: deliveryOrderId },
                include: {
                    items: {
                        select: { productVariantId: true, quantity: true },
                    },
                    salesOrder: {
                        include: {
                            items: {
                                select: {
                                    id: true,
                                    productVariantId: true,
                                    deliveredQty: true,
                                },
                            },
                            invoices: {
                                select: {
                                    id: true,
                                    invoiceNumber: true,
                                    status: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!doRecord)
                throw new NotFoundError('Delivery Order', deliveryOrderId);

            if (doRecord.status !== DeliveryStatus.SHIPPED) {
                throw new BusinessRuleError(
                    `Hanya DO berstatus SHIPPED yang bisa direverse (status saat ini: ${doRecord.status}).`,
                    { deliveryOrderId, status: doRecord.status },
                    'INVALID_DELIVERY_STATUS',
                );
            }

            if (!doRecord.stockCommittedAt) {
                throw new BusinessRuleError(
                    'DO belum pernah commit stok — tidak ada yang perlu direverse.',
                    { deliveryOrderId },
                );
            }

            // Proof of delivery already recorded → too late for a reverse, use Sales Return
            if (doRecord.proofOfDeliveryAt) {
                throw new BusinessRuleError(
                    'Bukti terima sudah direkam untuk DO ini — gunakan Retur Penjualan, bukan Batalkan Pengiriman.',
                    { deliveryOrderId },
                    'PROOF_OF_DELIVERY_EXISTS',
                );
            }

            // Idempotent: a DO can only be reversed once (source marker on the
            // reversal movements), same pattern as execution-void-helper.ts.
            const alreadyReversed = await tx.stockMovement.findFirst({
                where: {
                    reference: { contains: sourceMarker(deliveryOrderId) },
                },
                select: { id: true },
            });
            if (alreadyReversed) {
                throw new BusinessRuleError(
                    'DO ini sudah pernah direverse sebelumnya.',
                    { deliveryOrderId },
                    'ALREADY_REVERSED',
                );
            }

            const periodOpen = await isPeriodOpen(
                doRecord.stockCommittedAt,
                tx,
            );
            if (!periodOpen) {
                throw new BusinessRuleError(
                    'Periode fiskal saat pengiriman sudah CLOSED — gunakan Retur Penjualan atau jurnal koreksi.',
                    {
                        deliveryOrderId,
                        stockCommittedAt: doRecord.stockCommittedAt,
                    },
                    'FISCAL_PERIOD_CLOSED',
                );
            }

            // Invoice guards: never reverse behind money already collected.
            const paidInvoice = doRecord.salesOrder.invoices.find((inv) =>
                ['PAID', 'PARTIAL'].includes(inv.status),
            );
            if (paidInvoice) {
                throw new BusinessRuleError(
                    `Invoice ${paidInvoice.invoiceNumber} sudah berstatus ${paidInvoice.status} — pakai Retur Penjualan, bukan Batalkan Pengiriman.`,
                    { deliveryOrderId, invoiceId: paidInvoice.id },
                    'INVOICE_ALREADY_PAID',
                );
            }

            // Note: voids every DRAFT/UNPAID invoice on the SO, not just the
            // portion attributable to this DO. Safe for the common case (one
            // open DO per SO at a time — see delivery-fulfillment-service.ts
            // D6), but a SO with multiple SHIPPED DOs over time (supplementary
            // invoices) would lose the other DO's invoice too. Out of scope
            // for this MVP reversal; flagged in the plan's residual gaps.
            const voidableInvoices = doRecord.salesOrder.invoices.filter(
                (inv) => inv.status === 'DRAFT' || inv.status === 'UNPAID',
            );
            for (const inv of voidableInvoices) {
                const remittanceItem = await tx.salesRemittanceItem.findFirst({
                    where: { invoiceId: inv.id },
                    include: {
                        remittance: {
                            select: { status: true, remittanceNumber: true },
                        },
                    },
                });
                if (
                    remittanceItem &&
                    remittanceItem.remittance.status !== 'REJECTED'
                ) {
                    throw new BusinessRuleError(
                        `Invoice ${inv.invoiceNumber} sudah masuk setoran ${remittanceItem.remittance.remittanceNumber} (status ${remittanceItem.remittance.status}) — selesaikan atau tolak setoran dulu.`,
                        {
                            deliveryOrderId,
                            invoiceId: inv.id,
                            remittanceId: remittanceItem.remittanceId,
                        },
                        'INVOICE_IN_REMITTANCE',
                    );
                }
            }

            // Reverse the stock OUT movements this DO created at commit time.
            const movements = await tx.stockMovement.findMany({
                where: {
                    salesOrderId: doRecord.salesOrderId,
                    type: MovementType.OUT,
                    reference: `Shipment for ${doRecord.salesOrder.orderNumber} via ${doRecord.orderNumber}`,
                },
            });

            let reversedLines = 0;
            for (const move of movements) {
                await InventoryCoreService.incrementStock(
                    tx,
                    move.fromLocationId!,
                    move.productVariantId,
                    Number(move.quantity),
                );
                const reversal = await tx.stockMovement.create({
                    data: {
                        type: MovementType.IN,
                        productVariantId: move.productVariantId,
                        toLocationId: move.fromLocationId,
                        quantity: move.quantity,
                        cost: move.cost,
                        salesOrderId: doRecord.salesOrderId,
                        createdById: userId,
                        reference: `${REVERSAL_PREFIX}${move.reference ?? move.id} ${sourceMarker(deliveryOrderId)}`,
                    },
                });
                await AccountingService.recordInventoryMovement(reversal, tx);
                reversedLines += 1;
            }

            // Give back deliveredQty per line, clamped at 0.
            for (const doItem of doRecord.items) {
                const qty = Number(doItem.quantity);
                if (qty <= 0) continue;
                const soItem = doRecord.salesOrder.items.find(
                    (si) => si.productVariantId === doItem.productVariantId,
                );
                if (!soItem) continue;
                const newDelivered = Math.max(
                    0,
                    Number(soItem.deliveredQty) - qty,
                );
                await tx.salesOrderItem.update({
                    where: { id: soItem.id },
                    data: { deliveredQty: newDelivered },
                });
            }

            await tx.deliveryOrder.update({
                where: { id: deliveryOrderId },
                data: {
                    status: DeliveryStatus.CANCELLED,
                    stockCommittedAt: null,
                    stockCommittedById: null,
                    notes: doRecord.notes
                        ? `${doRecord.notes}\n[REVERSE] ${reason}`
                        : `[REVERSE] ${reason}`,
                },
            });

            // SO reopens to READY_TO_SHIP only once every line is back to 0
            // delivered — otherwise other shipments still cover part of it.
            const refreshedSoItems = await tx.salesOrderItem.findMany({
                where: { salesOrderId: doRecord.salesOrderId },
                select: { deliveredQty: true },
            });
            const allZero = refreshedSoItems.every(
                (i) => Number(i.deliveredQty) === 0,
            );
            await tx.salesOrder.update({
                where: { id: doRecord.salesOrderId },
                data: {
                    status: allZero
                        ? SalesOrderStatus.READY_TO_SHIP
                        : SalesOrderStatus.IN_PRODUCTION,
                },
            });

            for (const inv of voidableInvoices) {
                await updateInvoiceStatus(
                    { id: inv.id, status: 'CANCELLED' },
                    userId,
                    tx,
                );
            }

            const reservedUntil = new Date(
                Date.now() + RESERVATION_HOLD_DAYS * 24 * 60 * 60 * 1000,
            );
            await tx.stockReservation.updateMany({
                where: {
                    referenceId: doRecord.salesOrderId,
                    reservedFor: ReservationType.SALES_ORDER,
                    status: ReservationStatus.FULFILLED,
                },
                data: { status: ReservationStatus.ACTIVE, reservedUntil },
            });

            // Cascade to any delivery-schedule stop linked to this DO — cancel,
            // don't revert to PLANNED, mirroring removeOrderFromSchedule /
            // cancelOrder's existing convention (keeps deliveryOrderId as
            // history instead of pretending the stop never had a DO).
            await tx.deliveryScheduleOrder.updateMany({
                where: { deliveryOrderId, status: { not: 'CANCELLED' } },
                data: { status: 'CANCELLED' },
            });

            await logActivity({
                userId,
                action: 'REVERSE_DELIVERY_SHIPMENT',
                entityType: 'DeliveryOrder',
                entityId: deliveryOrderId,
                details:
                    `DO ${doRecord.orderNumber} (SO ${doRecord.salesOrder.orderNumber}) direverse: ` +
                    `${reversedLines} baris stok dikembalikan, ${voidableInvoices.length} invoice dibatalkan. ` +
                    `Alasan: ${reason}`,
                fromStatus: 'SHIPPED',
                toStatus: 'CANCELLED',
                tx,
            });

            return { success: true, reversedLines };
        },
        { timeout: 30_000, maxWait: 10_000 },
    );
}
