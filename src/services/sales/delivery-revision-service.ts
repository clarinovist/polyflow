import { salesTransactionClient } from './transaction-client';
import { Prisma, ProductType, ReservationType, Unit } from '@prisma/client';
import { readInvoiceSnapshot } from '@/lib/finance/invoice-snapshot';
import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import {
    deliveryRevisionSchema,
    type DeliveryRevisionInput,
} from '@/lib/schemas/delivery-revision';
import { calculatePpn } from '@/lib/utils/ppn';
import { logActivity } from '@/lib/tools/audit';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { createStockReservation } from '@/services/inventory/reservation-service';
import { isSalesStockReservationEnabled } from '@/lib/config/stock-reservation-flag';

const include = {
    items: true,
    salesOrder: {
        include: {
            items: {
                include: { productVariant: { include: { product: true } } },
            },
            invoices: true,
        },
    },
} satisfies Prisma.DeliveryOrderInclude;
type Delivery = Prisma.DeliveryOrderGetPayload<{ include: typeof include }>;
const n = (value: Prisma.Decimal | number | null) => Number(value ?? 0);
const qty = (value: number) => Math.round(value * 10000) / 10000;

function assertEditable(delivery: Delivery) {
    if (
        !['PENDING', 'LOADING'].includes(delivery.status) ||
        delivery.stockCommittedAt
    ) {
        throw new BusinessRuleError(
            'Revisi hanya sebelum Surat Jalan dikirim. Gunakan pembatalan pengiriman atau retur.',
        );
    }
    const so = delivery.salesOrder;
    if (
        !['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP'].includes(so.status) ||
        so.orderType === 'MAKLON_JASA'
    ) {
        throw new BusinessRuleError(
            'SO tidak dalam status yang bisa direvisi untuk pengiriman.',
        );
    }
    if (so.priceStatus === 'PENDING') {
        throw new BusinessRuleError(
            'Harga SO masih menunggu persetujuan. Selesaikan persetujuan terlebih dahulu.',
        );
    }
    const ids = so.items.map((item) => item.productVariantId);
    if (
        new Set(ids).size !== ids.length ||
        new Set(delivery.items.map((item) => item.productVariantId)).size !==
            delivery.items.length
    ) {
        throw new BusinessRuleError(
            'Varian duplikat pada SO/SJ belum didukung untuk revisi muatan. Hubungi admin.',
        );
    }
    if (
        so.items.some(
            (item) =>
                item.productVariant.product.productType === ProductType.SERVICE,
        ) ||
        delivery.items.some((item) => !ids.includes(item.productVariantId))
    ) {
        throw new BusinessRuleError(
            'Item SO dan Surat Jalan tidak cocok atau bukan barang fisik. Hubungi admin.',
        );
    }
}

export async function getDeliveryRevision(deliveryOrderId: string) {
    const delivery = await prisma.deliveryOrder.findUnique({
        where: { id: deliveryOrderId },
        include,
    });
    if (!delivery) throw new NotFoundError('Delivery Order', deliveryOrderId);
    assertEditable(delivery);
    return {
        deliveryOrderId,
        orderVersion: delivery.salesOrder.updatedAt.toISOString(),
        deliveryVersion: delivery.updatedAt.toISOString(),
        orderNumber: delivery.salesOrder.orderNumber,
        items: delivery.salesOrder.items.map((item) => ({
            salesOrderItemId: item.id,
            productVariantId: item.productVariantId,
            name: item.productVariant.name,
            unit: item.productVariant.primaryUnit,
            ordered: n(item.quantity),
            delivered: n(item.deliveredQty),
            unitPrice: n(item.unitPrice),
            quantity: n(
                delivery.items.find(
                    (line) => line.productVariantId === item.productVariantId,
                )?.quantity ?? 0,
            ),
        })),
    };
}

export async function searchRevisionProducts(search: string) {
    const rows = await prisma.productVariant.findMany({
        where: {
            archivedAt: null,
            product: { productType: { not: ProductType.SERVICE } },
            OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { skuCode: { contains: search, mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true, skuCode: true, primaryUnit: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 30,
    });
    return rows;
}

/** Check incremental credit in the same transaction, excluding this SO's old amount. */
async function checkRevisionCredit(
    tx: Prisma.TransactionClient,
    so: Delivery['salesOrder'],
    amount: number,
) {
    if (!so.customerId || amount <= n(so.totalAmount)) return;
    await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${so.customerId} FOR UPDATE`;
    const customer = await tx.customer.findUnique({
        where: { id: so.customerId },
        select: { creditLimit: true },
    });
    if (!customer?.creditLimit || n(customer.creditLimit) <= 0) return;
    const invoices = await tx.invoice.findMany({
        where: {
            salesOrder: { customerId: so.customerId },
            status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
        },
        select: { totalAmount: true, paidAmount: true },
    });
    const otherOrders = await tx.salesOrder.findMany({
        where: {
            id: { not: so.id },
            customerId: so.customerId,
            status: {
                in: ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED'],
            },
            invoices: { none: {} },
        },
        select: { totalAmount: true },
    });
    // Already invoiced goods on this SO remain fixed; count only its unbilled remainder.
    const invoiced = so.invoices
        .filter((i) => i.status !== 'CANCELLED' && i.status !== 'DRAFT')
        .reduce((sum, i) => sum + n(i.totalAmount) - n(i.roundingAmount), 0);
    const exposure =
        invoices.reduce(
            (sum, i) => sum + n(i.totalAmount) - n(i.paidAmount),
            0,
        ) +
        otherOrders.reduce((sum, order) => sum + n(order.totalAmount), 0) +
        Math.max(0, amount - invoiced);
    if (exposure > n(customer.creditLimit)) {
        throw new BusinessRuleError(
            'Revisi melebihi batas kredit pelanggan. Hubungi admin/finance.',
            {},
            'CREDIT_LIMIT_EXCEEDED',
        );
    }
}

export async function reviseDelivery(
    input: DeliveryRevisionInput,
    userId: string,
) {
    const data = deliveryRevisionSchema.parse(input);
    return salesTransactionClient().$transaction(
        async (tx) => {
            const ref = await tx.deliveryOrder.findUnique({
                where: { id: data.deliveryOrderId },
                select: { salesOrderId: true },
            });
            if (!ref)
                throw new NotFoundError('Delivery Order', data.deliveryOrderId);
            // Consistent lock order with shipment/invoicing: SO -> DO -> inventory.
            await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${ref.salesOrderId} FOR UPDATE`;
            await tx.$queryRaw`SELECT id FROM "DeliveryOrder" WHERE id = ${data.deliveryOrderId} FOR UPDATE`;
            const delivery = await tx.deliveryOrder.findUnique({
                where: { id: data.deliveryOrderId },
                include,
            });
            if (!delivery)
                throw new NotFoundError('Delivery Order', data.deliveryOrderId);
            assertEditable(delivery);
            const so = delivery.salesOrder;
            const { assertInvoiceAllocationKnown } =
                await import('@/services/finance/invoice-snapshot-service');
            await assertInvoiceAllocationKnown(tx, so.id);
            if (
                so.updatedAt.toISOString() !== data.orderVersion ||
                delivery.updatedAt.toISOString() !== data.deliveryVersion
            ) {
                throw new BusinessRuleError(
                    'Data telah berubah. Tutup dan buka ulang revisi muatan.',
                    {},
                    'STALE_DELIVERY_REVISION',
                );
            }
            const otherOpen = await tx.deliveryOrder.count({
                where: {
                    salesOrderId: so.id,
                    id: { not: delivery.id },
                    status: { in: ['PENDING', 'LOADING'] },
                },
            });
            if (otherOpen)
                throw new BusinessRuleError(
                    'Ada Surat Jalan aktif lain. Selesaikan terlebih dahulu.',
                );
            const submitted = new Map(
                data.items.map((item) => [
                    item.salesOrderItemId,
                    item.quantity,
                ]),
            );
            if (
                submitted.size !== so.items.length ||
                so.items.some((item) => !submitted.has(item.id))
            ) {
                throw new BusinessRuleError(
                    'Daftar item SO telah berubah. Muat ulang revisi.',
                );
            }
            if (
                data.additions.some((item) =>
                    so.items.some(
                        (old) => old.productVariantId === item.productVariantId,
                    ),
                )
            ) {
                throw new BusinessRuleError(
                    'Barang sudah ada pada SO. Ubah qty baris yang tersedia.',
                );
            }
            const variants = await tx.productVariant.findMany({
                where: {
                    id: {
                        in: data.additions.map((item) => item.productVariantId),
                    },
                    archivedAt: null,
                    product: { productType: { not: ProductType.SERVICE } },
                },
                select: { id: true, primaryUnit: true },
            });
            if (variants.length !== data.additions.length)
                throw new BusinessRuleError(
                    'Barang tambahan tidak tersedia atau telah diarsipkan.',
                );

            const before = so.items.map((item) => ({
                id: item.id,
                productVariantId: item.productVariantId,
                quantity: n(item.quantity),
                unitPrice: n(item.unitPrice),
                deliveredQty: n(item.deliveredQty),
            }));
            const lines = so.items.map((item) => {
                const load = submitted.get(item.id)!;
                const target =
                    data.remainder === 'CLOSE'
                        ? qty(n(item.deliveredQty) + load)
                        : Math.max(
                              n(item.quantity),
                              qty(n(item.deliveredQty) + load),
                          );
                if (load > 0 && !item.isFreeItem && n(item.unitPrice) <= 0)
                    throw new BusinessRuleError(
                        'Harga item SO belum lengkap. Lengkapi harga sebelum revisi.',
                    );
                return {
                    id: item.id,
                    productVariantId: item.productVariantId,
                    quantity: target,
                    load,
                    delivered: n(item.deliveredQty),
                    unitPrice: n(item.unitPrice),
                    discountPercent: n(item.discountPercent),
                    taxPercent: n(item.taxPercent),
                    ppnMode: item.ppnMode,
                    unit: item.productVariant.primaryUnit,
                    factor: n(item.conversionFactorSnapshot) || 1,
                    enteredUnit: item.enteredUnit,
                    isFreeItem: item.isFreeItem,
                };
            });
            for (const addition of data.additions) {
                lines.push({
                    id: '',
                    productVariantId: addition.productVariantId,
                    quantity: addition.quantity,
                    load: addition.quantity,
                    delivered: 0,
                    unitPrice: addition.unitPrice,
                    discountPercent: 0,
                    taxPercent: addition.taxPercent,
                    ppnMode: addition.ppnMode,
                    unit: variants.find(
                        (v) => v.id === addition.productVariantId,
                    )!.primaryUnit,
                    factor: 1,
                    enteredUnit: null as Unit | null,
                    isFreeItem: false,
                });
            }
            let total = 0,
                discount = 0,
                tax = 0;
            const priced = lines.map((line) => {
                const raw = line.quantity * line.unitPrice;
                const lineDiscount = (raw * line.discountPercent) / 100;
                const ppn = calculatePpn(
                    raw - lineDiscount,
                    line.taxPercent,
                    line.ppnMode,
                );
                total += ppn.total;
                discount += lineDiscount;
                tax += ppn.taxAmount;
                return {
                    ...line,
                    subtotal: ppn.total,
                    taxAmount: ppn.taxAmount,
                };
            });
            total += n(so.shippingCost);
            const billed = new Map<string, number>();
            for (const invoice of so.invoices.filter(
                (i) => !['DRAFT', 'CANCELLED'].includes(i.status),
            )) {
                for (const item of readInvoiceSnapshot(
                    invoice.commercialSnapshot,
                )?.items ?? []) {
                    billed.set(
                        item.sourceItemId,
                        (billed.get(item.sourceItemId) ?? 0) + item.quantity,
                    );
                }
            }
            if (
                priced.some(
                    (line) => line.quantity < (billed.get(line.id) ?? 0),
                )
            ) {
                throw new BusinessRuleError(
                    'Qty sudah ditagihkan dalam invoice terbit. Selesaikan pembatalan/kredit invoice melalui Finance sebelum mengurangi pesanan.',
                );
            }
            await checkRevisionCredit(tx, so, total);
            // A pre-shipment invoice cannot silently retain the superseded commercial total.
            if (
                so.items.every((item) => n(item.deliveredQty) === 0) &&
                so.invoices.some((i) => i.status !== 'CANCELLED')
            ) {
                throw new BusinessRuleError(
                    'SO sudah memiliki invoice sebelum pengiriman. Selesaikan pembatalan invoice melalui finance sebelum revisi.',
                );
            }
            for (const line of [...priced].sort((a, b) =>
                a.productVariantId.localeCompare(b.productVariantId),
            )) {
                if (line.load > 0)
                    await InventoryCoreService.validateAndLockStock(
                        tx,
                        delivery.sourceLocationId,
                        line.productVariantId,
                        line.load,
                        so.id,
                    );
                const old = so.items.find((item) => item.id === line.id);
                const changed = !old || n(old.quantity) !== line.quantity;
                if (changed) {
                    const fields = {
                        quantity: line.quantity,
                        enteredQuantity: qty(line.quantity / line.factor),
                        subtotal: line.subtotal,
                        taxAmount: line.taxAmount,
                    };
                    if (old) {
                        await tx.salesOrderItem.update({
                            where: { id: old.id },
                            data: fields,
                        });
                    } else {
                        const created = await tx.salesOrderItem.create({
                            data: {
                                ...fields,
                                salesOrderId: so.id,
                                productVariantId: line.productVariantId,
                                unitPrice: line.unitPrice,
                                enteredUnitPrice: line.unitPrice,
                                enteredUnit: line.unit,
                                conversionFactorSnapshot: 1,
                                discountPercent: 0,
                                taxPercent: line.taxPercent,
                                ppnMode: line.ppnMode,
                            },
                        });
                        line.id = created.id;
                    }
                    await tx.stockReservation.updateMany({
                        where: {
                            referenceId: so.id,
                            reservedFor: ReservationType.SALES_ORDER,
                            productVariantId: line.productVariantId,
                            status: { in: ['ACTIVE', 'WAITING'] },
                        },
                        data: { status: 'CANCELLED' },
                    });
                    const residual = qty(line.quantity - line.delivered);
                    if (residual > 0 && isSalesStockReservationEnabled())
                        await createStockReservation(
                            {
                                referenceId: so.id,
                                reservedFor: ReservationType.SALES_ORDER,
                                productVariantId: line.productVariantId,
                                locationId: delivery.sourceLocationId,
                                quantity: residual,
                            },
                            tx,
                        );
                }
            }
            // Replace DO rows, not SO identities. Stale verification/qty payloads now fail by id.
            await tx.deliveryOrderItem.deleteMany({
                where: { deliveryOrderId: delivery.id },
            });
            await tx.deliveryOrder.update({
                where: { id: delivery.id },
                data: {
                    loadVerifiedAt: null,
                    loadVerifiedById: null,
                    items: {
                        create: priced
                            .filter((line) => line.load > 0)
                            .map((line) => ({
                                productVariantId: line.productVariantId,
                                quantity: line.load,
                                enteredQuantity: qty(line.load / line.factor),
                                enteredUnit: line.enteredUnit ?? line.unit,
                                conversionFactorSnapshot: line.factor,
                                notes: delivery.items.find(
                                    (item) =>
                                        item.productVariantId ===
                                        line.productVariantId,
                                )?.notes,
                            })),
                    },
                },
            });
            await tx.salesOrder.update({
                where: { id: so.id },
                data: {
                    totalAmount: total,
                    discountAmount: discount,
                    taxAmount: tax,
                },
            });
            const changes = {
                reason: data.reason,
                remainder: data.remainder,
                before,
                after: priced.map((line) => ({
                    id: line.id,
                    productVariantId: line.productVariantId,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    deliveredQty: line.delivered,
                    load: line.load,
                })),
                deliveryBefore: delivery.items.map((line) => ({
                    productVariantId: line.productVariantId,
                    quantity: n(line.quantity),
                })),
            };
            for (const [entityType, entityId] of [
                ['SalesOrder', so.id],
                ['DeliveryOrder', delivery.id],
            ])
                await logActivity({
                    userId,
                    action: 'REVISE_DELIVERY_LOAD',
                    entityType,
                    entityId,
                    tx,
                    details: `Revisi muatan: ${data.reason}. Sisa: ${data.remainder === 'KEEP' ? 'tetap terbuka' : 'dibatalkan sesuai realisasi'}. Wajib verifikasi ulang.`,
                    changes,
                });
            return { salesOrderId: so.id, deliveryOrderId: delivery.id };
        },
        {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 30000,
        },
    );
}
