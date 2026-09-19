import { salesTransactionClient } from './transaction-client';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';

type LoadOperation =
    | { kind: 'quantity'; items: { id: string; quantity: number }[] }
    | { kind: 'verify'; items: { id: string; verifiedQuantity: number }[] }
    | { kind: 'lock' }
    | { kind: 'correct' };

/** Every loading mutation shares the same lock order as revision and shipment. */
export async function changeDeliveryLoad(
    deliveryOrderId: string,
    userId: string,
    operation: LoadOperation,
) {
    return salesTransactionClient().$transaction(async (tx) => {
        await tx.$queryRaw`SELECT so.id FROM "SalesOrder" so
            JOIN "DeliveryOrder" d ON d."salesOrderId" = so.id
            WHERE d.id = ${deliveryOrderId} FOR UPDATE OF so`;
        await tx.$queryRaw`SELECT id FROM "DeliveryOrder" WHERE id = ${deliveryOrderId} FOR UPDATE`;
        const record = await tx.deliveryOrder.findUnique({
            where: { id: deliveryOrderId },
            include: { items: true, salesOrder: { include: { items: true } } },
        });
        if (!record) throw new NotFoundError('Delivery Order', deliveryOrderId);
        if (
            !['PENDING', 'LOADING'].includes(record.status) ||
            record.stockCommittedAt
        ) {
            throw new BusinessRuleError(
                'Qty/verifikasi hanya saat SJ PENDING atau LOADING.',
                {},
                'INVALID_DELIVERY_STATUS',
            );
        }
        if (record.salesOrder.status === 'CANCELLED')
            throw new BusinessRuleError('SO sudah dibatalkan.');
        const ids = new Set(record.items.map((item) => item.id));
        if (
            'items' in operation &&
            (new Set(operation.items.map((item) => item.id)).size !==
                operation.items.length ||
                operation.items.some((item) => !ids.has(item.id)))
        ) {
            throw new BusinessRuleError(
                'Item SJ telah berubah. Muat ulang sebelum verifikasi.',
                {},
                'STALE_DELIVERY_LOAD',
            );
        }
        const soItems = record.salesOrder.items;
        if (
            new Set(soItems.map((item) => item.productVariantId)).size !==
                soItems.length ||
            new Set(record.items.map((item) => item.productVariantId)).size !==
                record.items.length
        ) {
            throw new BusinessRuleError(
                'Varian duplikat pada SO/SJ. Hubungi admin.',
            );
        }
        const updates: {
            id: string;
            data: Prisma.DeliveryOrderItemUpdateInput;
        }[] = [];
        const now = new Date();
        for (const item of record.items) {
            const soItem = soItems.find(
                (line) => line.productVariantId === item.productVariantId,
            );
            if (!soItem)
                throw new BusinessRuleError(
                    'Item SJ tidak cocok dengan SO. Revisi muatan melalui sales.',
                );
            let planned = Number(item.quantity);
            let verified =
                item.verifiedQuantity == null
                    ? null
                    : Number(item.verifiedQuantity);
            if (operation.kind === 'quantity') {
                const patch = operation.items.find(
                    (line) => line.id === item.id,
                );
                if (patch) planned = patch.quantity;
            } else if (operation.kind === 'verify') {
                const patch = operation.items.find(
                    (line) => line.id === item.id,
                );
                if (patch) verified = patch.verifiedQuantity;
            }
            if (operation.kind === 'lock' || operation.kind === 'correct') {
                if (verified == null)
                    throw new BusinessRuleError(
                        'Semua baris harus punya qty verifikasi sebelum dikunci.',
                        {},
                        'LOAD_VERIFY_INCOMPLETE',
                    );
                if (operation.kind === 'correct') planned = verified;
                if (Math.abs(planned - verified) > 0.000001)
                    throw new BusinessRuleError(
                        'Ada selisih qty fisik vs perintah. Koreksi qty atau hitung ulang.',
                        {},
                        'LOAD_VERIFY_MISMATCH',
                    );
            }
            if (
                !Number.isFinite(planned) ||
                planned < 0 ||
                (verified != null &&
                    (!Number.isFinite(verified) || verified < 0))
            ) {
                throw new BusinessRuleError('Qty tidak valid.');
            }
            // Saving a count may record an excess; changing the command or locking may not approve it.
            const maxAllowed = Math.max(
                0,
                Number(soItem.quantity) - Number(soItem.deliveredQty),
            );
            if (
                operation.kind !== 'verify' &&
                planned > maxAllowed + 0.000001
            ) {
                throw new BusinessRuleError(
                    `Qty melebihi sisa SO (maks ${maxAllowed}). Hubungi sales untuk Revisi muatan / barang.`,
                    { requested: planned, maxAllowed },
                    'DO_QTY_EXCEEDS_SO_RESIDUAL',
                );
            }
            if (operation.kind === 'quantity') {
                updates.push({
                    id: item.id,
                    data: {
                        quantity: planned,
                        enteredQuantity:
                            Math.round(
                                (planned /
                                    (Number(item.conversionFactorSnapshot) ||
                                        1)) *
                                    10000,
                            ) / 10000,
                        verifiedQuantity: null,
                        verifiedAt: null,
                        verifiedById: null,
                    },
                });
            } else if (operation.kind === 'verify') {
                if (operation.items.some((line) => line.id === item.id))
                    updates.push({
                        id: item.id,
                        data: {
                            verifiedQuantity: verified,
                            verifiedAt: now,
                            verifiedById: userId,
                        },
                    });
            } else if (operation.kind === 'correct') {
                updates.push({
                    id: item.id,
                    data: {
                        quantity: planned,
                        enteredQuantity:
                            Math.round(
                                (planned /
                                    (Number(item.conversionFactorSnapshot) ||
                                        1)) *
                                    10000,
                            ) / 10000,
                        verifiedQuantity: planned,
                        verifiedAt: now,
                        verifiedById: userId,
                    },
                });
            }
        }
        if (!record.items.length)
            throw new BusinessRuleError('Surat Jalan tidak punya item.');
        for (const update of updates)
            await tx.deliveryOrderItem.update({
                where: { id: update.id },
                data: update.data,
            });
        const locking =
            operation.kind === 'lock' || operation.kind === 'correct';
        await tx.deliveryOrder.update({
            where: { id: deliveryOrderId },
            data: {
                loadVerifiedAt: locking ? now : null,
                loadVerifiedById: locking ? userId : null,
            },
        });
        const actions = {
            quantity: 'UPDATE_DELIVERY_QTY',
            verify: 'SAVE_DELIVERY_LOAD_VERIFICATION',
            lock: 'CONFIRM_DELIVERY_LOAD_VERIFIED',
            correct: 'CORRECT_DELIVERY_QTY_TO_VERIFIED',
        };
        await logActivity({
            userId,
            action: actions[operation.kind],
            entityType: 'DeliveryOrder',
            entityId: deliveryOrderId,
            tx,
            details: `Surat Jalan ${record.orderNumber}: ${operation.kind}; ${locking ? 'verifikasi dikunci' : 'verifikasi belum dikunci'}.`,
            changes: {
                before: record.items.map((item) => ({
                    id: item.id,
                    quantity: Number(item.quantity),
                    verifiedQuantity:
                        item.verifiedQuantity == null
                            ? null
                            : Number(item.verifiedQuantity),
                })),
                updates,
            },
        });
        return { salesOrderId: record.salesOrderId };
    });
}
