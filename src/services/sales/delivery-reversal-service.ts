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
    Prisma,
    type StockMovement,
    ReservationStatus,
    ReservationType,
    SalesOrderStatus,
} from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { recordShipmentReversal } from '@/services/accounting/shipment-reversal-journal';
import { updateInvoiceStatus } from '@/services/finance/invoice-lifecycle-service';
import { requireOpenJournalPeriod } from '@/services/finance/sales-recognition-service';
import { logActivity } from '@/lib/tools/audit';

const REVERSAL_PREFIX = 'VOID: ';
const RESERVATION_HOLD_DAYS = 7;

function sourceMarker(deliveryOrderId: string) {
    return `[SOURCE:${deliveryOrderId}]`;
}

type ShipmentQuantity = { productVariantId: string; quantity: Prisma.Decimal };

function movementMismatch() {
    return new BusinessRuleError(
        'Mutasi stok pengiriman tidak sesuai item atau lokasi DO; finance perlu memeriksa sumber.',
        {}, 'SHIPMENT_MOVEMENTS_MISMATCH',
    );
}

function quantityTotals(rows: ShipmentQuantity[]) {
    return rows.reduce((totals, row) => {
        const quantity = new Prisma.Decimal(row.quantity);
        if (!quantity.isFinite() || quantity.lt(0)) throw movementMismatch();
        // The shipment producer skips DO rows corrected to zero.
        if (quantity.isZero()) return totals;
        return new Map([...totals, [row.productVariantId,
            (totals.get(row.productVariantId) ?? new Prisma.Decimal(0)).add(quantity)]]);
    }, new Map<string, Prisma.Decimal>());
}

function validateMovementSet(items: ShipmentQuantity[], movements: StockMovement[], locationId: string) {
    // commitDeliveryShipment emits OUT from the DO source, with no destination.
    if (movements.some(move => move.type !== MovementType.OUT ||
        move.fromLocationId !== locationId || !move.fromLocationId || move.toLocationId !== null ||
        move.goodsReceiptId || move.productionOrderId || !new Prisma.Decimal(move.quantity).gt(0))) {
        throw movementMismatch();
    }
    const expected = quantityTotals(items);
    const actual = quantityTotals(movements);
    if (actual.size !== expected.size || [...expected].some(([variant, quantity]) =>
        !actual.get(variant)?.equals(quantity))) throw movementMismatch();
    return expected;
}

function deliveredUpdates(
    totals: Map<string, Prisma.Decimal>,
    items: { id: string; productVariantId: string; deliveredQty: Prisma.Decimal }[],
) {
    return [...totals].map(([variant, quantity]) => {
        const matches = items.filter(item => item.productVariantId === variant);
        // DO items have no SO-item ID. Never guess which repeated SO row shipped.
        if (matches.length !== 1) throw new BusinessRuleError(
            'Atribusi item SO untuk pembatalan pengiriman hilang atau ambigu; finance perlu memeriksa sumber.',
            { productVariantId: variant }, 'SHIPMENT_ITEM_ATTRIBUTION_UNRESOLVED',
        );
        return { id: matches[0].id,
            deliveredQty: Prisma.Decimal.max(0, new Prisma.Decimal(matches[0].deliveredQty).minus(quantity)) };
    });
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
            // The source marker alone is a check-then-act race. Serialize on DO.
            await tx.$queryRaw`SELECT id FROM "DeliveryOrder" WHERE id = ${deliveryOrderId} FOR UPDATE`;
            // Payments serialize on Invoice; read paid status only after owning
            // those same locks, and hold them until cancellation commits.
            await tx.$queryRaw`SELECT i.id FROM "Invoice" i
                JOIN "DeliveryOrder" d ON d."salesOrderId" = i."salesOrderId"
                WHERE d.id = ${deliveryOrderId} ORDER BY i.id FOR UPDATE OF i`;
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

            await requireOpenJournalPeriod(tx, doRecord.stockCommittedAt);

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
                    reference: `Shipment for ${doRecord.salesOrder.orderNumber} via ${doRecord.orderNumber}`,
                },
            });

            if (movements.length === 0) {
                throw new BusinessRuleError('Mutasi stok pengiriman tidak ditemukan; finance perlu memeriksa sumber.',
                    { deliveryOrderId }, 'SHIPMENT_MOVEMENTS_MISSING');
            }

            // Share source locks with return receiving: reversal may never restock twice.
            for (const movementId of movements.map(move => move.id).sort()) {
                await tx.$queryRaw`SELECT id FROM "StockMovement" WHERE id = ${movementId} FOR UPDATE`;
            }
            if (await tx.salesReturnReceiptLine.count({ where: { sourceMovementId: { in: movements.map(move => move.id) } } })) {
                throw new BusinessRuleError('Pengiriman sudah digunakan penerimaan retur. Koreksi retur dahulu sebelum reversal pengiriman.');
            }
            // Validate the complete source before any inventory/DO/invoice mutation.
            const totals = validateMovementSet(doRecord.items, movements, doRecord.sourceLocationId);
            const updates = deliveredUpdates(totals, doRecord.salesOrder.items);

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
                await recordShipmentReversal(move, reversal, userId, tx, {
                    offBalanceSheet: doRecord.salesOrder.orderType === 'MAKLON_JASA',
                });
                reversedLines += 1;
            }

            // Aggregate repeated DO rows and give back deliveredQty exactly once.
            for (const update of updates) {
                await tx.salesOrderItem.update({
                    where: { id: update.id },
                    data: { deliveredQty: update.deliveredQty },
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
