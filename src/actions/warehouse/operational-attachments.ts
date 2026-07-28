'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logActivity } from '@/lib/tools/audit';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const CHECKPOINTS = ['LOAD', 'UNLOAD', 'DAMAGE', 'RECEIPT', 'OPNAME'] as const;
const DOC_TYPES = ['PHOTO', 'SURAT_JALAN', 'NOTA_INVOICE', 'BERITA_ACARA', 'OTHER'] as const;

const createSchema = z.object({
    deliveryOrderId: z.string().optional(),
    goodsReceiptId: z.string().optional(),
    purchaseOrderId: z.string().optional(),
    stockOpnameId: z.string().optional(),
    stockOpnameItemId: z.string().optional(),
    checkpoint: z.enum(CHECKPOINTS),
    documentType: z.enum(DOC_TYPES).default('PHOTO'),
    storageKey: z.string().min(1),
    url: z.string().min(1),
    originalName: z.string().optional(),
    mimeType: z.string().optional(),
    sizeBytes: z.number().optional(),
    note: z.string().optional(),
});

const ALLOWED_DO_STATUSES = [
    'PENDING',
    'LOADING',
    'SHIPPED',
    'IN_TRANSIT',
    'ARRIVED',
    'DELIVERED',
];

const ALLOWED_OPNAME_STATUSES = ['OPEN', 'COUNTING', 'REVIEWING'];

/**
 * Create a warehouse operational attachment record after file has been uploaded to R2.
 * Does NOT block the parent transaction — attachment is always optional.
 */
export const createWarehouseAttachment = withTenant(
    async function createWarehouseAttachment(
        data: z.infer<typeof createSchema>,
    ) {
        return safeAction(async () => {
            const session = await requireAuth();
            const parsed = createSchema.parse(data);

            const refs = [
                parsed.deliveryOrderId,
                parsed.goodsReceiptId,
                parsed.purchaseOrderId,
                parsed.stockOpnameId,
                parsed.stockOpnameItemId,
            ];
            if (!refs.some(Boolean)) {
                throw new BusinessRuleError(
                    'Attachment harus terikat ke salah satu transaksi.',
                );
            }

            // stockOpnameId + stockOpnameItemId pair is allowed
            const isOpnamePair = parsed.stockOpnameId && parsed.stockOpnameItemId;
            const refCount = refs.filter(Boolean).length;
            if (refCount > 1 && !isOpnamePair) {
                throw new BusinessRuleError(
                    'Attachment hanya boleh terikat ke satu transaksi.',
                );
            }

            // Validate parent entity exists and status allows attachment
            if (parsed.deliveryOrderId) {
                const doRecord = await prisma.deliveryOrder.findUnique({
                    where: { id: parsed.deliveryOrderId },
                    select: { id: true, status: true, orderNumber: true },
                });
                if (!doRecord) {
                    throw new BusinessRuleError('Delivery Order tidak ditemukan.');
                }
                if (!ALLOWED_DO_STATUSES.includes(doRecord.status)) {
                    throw new BusinessRuleError(
                        `Tidak bisa menambah bukti saat status ${doRecord.status}.`,
                    );
                }
            }

            if (parsed.goodsReceiptId) {
                const grRecord = await prisma.goodsReceipt.findUnique({
                    where: { id: parsed.goodsReceiptId },
                    select: { id: true, receiptNumber: true },
                });
                if (!grRecord) {
                    throw new BusinessRuleError('Goods Receipt tidak ditemukan.');
                }
            }

            if (parsed.purchaseOrderId) {
                const poRecord = await prisma.purchaseOrder.findUnique({
                    where: { id: parsed.purchaseOrderId },
                    select: { id: true, orderNumber: true },
                });
                if (!poRecord) {
                    throw new BusinessRuleError('Purchase Order tidak ditemukan.');
                }
            }

            if (parsed.stockOpnameId) {
                const soRecord = await prisma.stockOpname.findUnique({
                    where: { id: parsed.stockOpnameId },
                    select: { id: true, opnameNumber: true, status: true },
                });
                if (!soRecord) {
                    throw new BusinessRuleError('Stock Opname tidak ditemukan.');
                }
                if (!ALLOWED_OPNAME_STATUSES.includes(soRecord.status)) {
                    throw new BusinessRuleError(
                        `Tidak bisa menambah bukti saat status opname ${soRecord.status}.`,
                    );
                }
            }

            if (parsed.stockOpnameItemId) {
                const soiRecord = await prisma.stockOpnameItem.findUnique({
                    where: { id: parsed.stockOpnameItemId },
                    select: { id: true, opnameId: true },
                });
                if (!soiRecord) {
                    throw new BusinessRuleError('Stock Opname Item tidak ditemukan.');
                }
                // Auto-fill stockOpnameId if only itemId provided
                if (!parsed.stockOpnameId) {
                    parsed.stockOpnameId = soiRecord.opnameId;
                }
            }

            const attachment = await prisma.warehouseOperationalAttachment.create({
                data: {
                    deliveryOrderId: parsed.deliveryOrderId || null,
                    goodsReceiptId: parsed.goodsReceiptId || null,
                    purchaseOrderId: parsed.purchaseOrderId || null,
                    stockOpnameId: parsed.stockOpnameId || null,
                    stockOpnameItemId: parsed.stockOpnameItemId || null,
                    checkpoint: parsed.checkpoint,
                    documentType: parsed.documentType,
                    storageKey: parsed.storageKey,
                    url: parsed.url,
                    originalName: parsed.originalName || null,
                    mimeType: parsed.mimeType || null,
                    sizeBytes: parsed.sizeBytes || null,
                    note: parsed.note || null,
                    uploadedById: session.user.id,
                },
            });

            const entityLabel = parsed.deliveryOrderId
                ? `DO ${parsed.deliveryOrderId}`
                : parsed.goodsReceiptId
                  ? `GR ${parsed.goodsReceiptId}`
                  : parsed.purchaseOrderId
                    ? `PO ${parsed.purchaseOrderId}`
                    : `Opname ${parsed.stockOpnameId}`;

            await logActivity({
                userId: session.user.id,
                action: 'UPLOAD_WAREHOUSE_ATTACHMENT',
                entityType: 'WarehouseOperationalAttachment',
                entityId: attachment.id,
                details: `${parsed.documentType} ${parsed.checkpoint} uploaded for ${entityLabel}`,
            });

            if (parsed.deliveryOrderId) {
                revalidatePath('/warehouse/mobile/outgoing');
                revalidatePath(`/warehouse/mobile/outgoing/${parsed.deliveryOrderId}`);
                revalidatePath('/sales/deliveries');
                revalidatePath(`/sales/deliveries/${parsed.deliveryOrderId}`);
            }
            if (parsed.goodsReceiptId) {
                revalidatePath('/warehouse/mobile/incoming');
                revalidatePath(`/warehouse/mobile/incoming/${parsed.goodsReceiptId}`);
                revalidatePath('/warehouse/incoming');
                revalidatePath(`/warehouse/incoming/${parsed.goodsReceiptId}`);
            }
            if (parsed.purchaseOrderId) {
                revalidatePath('/warehouse/mobile/incoming');
                revalidatePath(`/warehouse/mobile/incoming/${parsed.purchaseOrderId}`);
                revalidatePath('/purchasing/orders');
                revalidatePath(`/purchasing/orders/${parsed.purchaseOrderId}`);
            }
            if (parsed.stockOpnameId) {
                revalidatePath('/warehouse/opname');
                revalidatePath(`/warehouse/opname/${parsed.stockOpnameId}`);
                revalidatePath('/warehouse/mobile/opname');
                revalidatePath(`/warehouse/mobile/opname/${parsed.stockOpnameId}`);
            }

            return { success: true, attachmentId: attachment.id };
        });
    },
);

/**
 * Delete a warehouse operational attachment.
 * Only the uploader can delete (phase 1 policy).
 */
export const deleteWarehouseAttachment = withTenant(
    async function deleteWarehouseAttachment(attachmentId: string) {
        return safeAction(async () => {
            const session = await requireAuth();

            const attachment =
                await prisma.warehouseOperationalAttachment.findUnique({
                    where: { id: attachmentId },
                    select: {
                        id: true,
                        uploadedById: true,
                        deliveryOrderId: true,
                        goodsReceiptId: true,
                        stockOpnameId: true,
                        checkpoint: true,
                        documentType: true,
                    },
                });

            if (!attachment) {
                throw new BusinessRuleError('Attachment tidak ditemukan.');
            }

            // Only uploader can delete (simple policy for phase 1)
            if (attachment.uploadedById !== session.user.id) {
                throw new BusinessRuleError(
                    'Hanya pengupload yang bisa menghapus bukti ini.',
                );
            }

            await prisma.warehouseOperationalAttachment.delete({
                where: { id: attachmentId },
            });

            await logActivity({
                userId: session.user.id,
                action: 'DELETE_WAREHOUSE_ATTACHMENT',
                entityType: 'WarehouseOperationalAttachment',
                entityId: attachmentId,
                details: `${attachment.documentType} ${attachment.checkpoint} deleted`,
            });

            if (attachment.deliveryOrderId) {
                revalidatePath('/warehouse/mobile/outgoing');
                revalidatePath(`/warehouse/mobile/outgoing/${attachment.deliveryOrderId}`);
                revalidatePath('/sales/deliveries');
                revalidatePath(`/sales/deliveries/${attachment.deliveryOrderId}`);
            }
            if (attachment.goodsReceiptId) {
                revalidatePath('/warehouse/mobile/incoming');
                revalidatePath(`/warehouse/mobile/incoming/${attachment.goodsReceiptId}`);
                revalidatePath('/warehouse/incoming');
                revalidatePath(`/warehouse/incoming/${attachment.goodsReceiptId}`);
            }
            if (attachment.stockOpnameId) {
                revalidatePath('/warehouse/opname');
                revalidatePath(`/warehouse/opname/${attachment.stockOpnameId}`);
                revalidatePath('/warehouse/mobile/opname');
                revalidatePath(`/warehouse/mobile/opname/${attachment.stockOpnameId}`);
            }

            return { success: true };
        });
    },
);

/**
 * List attachments for a delivery order, goods receipt, purchase order, or stock opname.
 */
export const listWarehouseAttachments = withTenant(
    async function listWarehouseAttachments(data: {
        deliveryOrderId?: string;
        goodsReceiptId?: string;
        purchaseOrderId?: string;
        stockOpnameId?: string;
    }) {
        return safeAction(async () => {
            await requireAuth();

            const where: Record<string, string> = {};
            if (data.deliveryOrderId) where.deliveryOrderId = data.deliveryOrderId;
            if (data.goodsReceiptId) where.goodsReceiptId = data.goodsReceiptId;
            if (data.purchaseOrderId) where.purchaseOrderId = data.purchaseOrderId;
            if (data.stockOpnameId) where.stockOpnameId = data.stockOpnameId;

            const attachments =
                await prisma.warehouseOperationalAttachment.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        uploadedBy: {
                            select: { id: true, name: true },
                        },
                    },
                });

            // `safeAction` already wraps the callback output in `{ success, data }`.
            // Returning another envelope makes callers receive an object here
            // instead of the attachment array and then crash on `.filter()`.
            return attachments;
        });
    },
);

/**
 * Migrate attachments from a Purchase Order to a Goods Receipt.
 * Called after GR is created from a PO receiving flow.
 */
export const migrateAttachmentsToGoodsReceipt = withTenant(
    async function migrateAttachmentsToGoodsReceipt(data: {
        purchaseOrderId: string;
        goodsReceiptId: string;
    }) {
        return safeAction(async () => {
            await requireAuth();

            const result = await prisma.warehouseOperationalAttachment.updateMany({
                where: { purchaseOrderId: data.purchaseOrderId },
                data: {
                    goodsReceiptId: data.goodsReceiptId,
                    purchaseOrderId: null,
                },
            });

            return { success: true, migrated: result.count };
        });
    },
);
