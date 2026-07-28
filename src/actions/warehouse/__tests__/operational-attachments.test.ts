import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        deliveryOrder: {
            findUnique: vi.fn(),
        },
        goodsReceipt: {
            findUnique: vi.fn(),
        },
        purchaseOrder: {
            findUnique: vi.fn(),
        },
        stockOpname: {
            findUnique: vi.fn(),
        },
        stockOpnameItem: {
            findUnique: vi.fn(),
        },
        warehouseOperationalAttachment: {
            create: vi.fn(),
            findMany: vi.fn(),
            findUnique: vi.fn(),
            delete: vi.fn(),
            updateMany: vi.fn(),
        },
    },
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
    getTenantContext: () => ({ tenantId: 'test-tenant' }),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import {
    createWarehouseAttachment,
    deleteWarehouseAttachment,
    listWarehouseAttachments,
    migrateAttachmentsToGoodsReceipt,
} from '@/actions/warehouse/operational-attachments';

const mockSession = { user: { id: 'user-1', name: 'Test User' } };

describe('Warehouse Operational Attachments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockResolvedValue(mockSession as never);
    });

    describe('createWarehouseAttachment', () => {
        it('creates attachment for delivery order', async () => {
            vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue({
                id: 'do-1',
                status: 'LOADING',
                orderNumber: 'DO-001',
            } as never);

            vi.mocked(prisma.warehouseOperationalAttachment.create).mockResolvedValue({
                id: 'att-1',
            } as never);

            const result = await createWarehouseAttachment({
                deliveryOrderId: 'do-1',
                checkpoint: 'LOAD',
                documentType: 'PHOTO',
                storageKey: 'test/key.jpg',
                url: '/api/images/test/key.jpg',
            });

            expect(result.success).toBe(true);
            expect(prisma.warehouseOperationalAttachment.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        deliveryOrderId: 'do-1',
                        goodsReceiptId: null,
                        purchaseOrderId: null,
                        stockOpnameId: null,
                        stockOpnameItemId: null,
                        checkpoint: 'LOAD',
                        documentType: 'PHOTO',
                    }),
                }),
            );
        });

        it('creates attachment for purchase order', async () => {
            vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue({
                id: 'po-1',
                orderNumber: 'PO-001',
            } as never);

            vi.mocked(prisma.warehouseOperationalAttachment.create).mockResolvedValue({
                id: 'att-2',
            } as never);

            const result = await createWarehouseAttachment({
                purchaseOrderId: 'po-1',
                checkpoint: 'RECEIPT',
                documentType: 'SURAT_JALAN',
                storageKey: 'test/doc.pdf',
                url: '/api/images/test/doc.pdf',
            });

            expect(result.success).toBe(true);
        });

        it('creates attachment for stock opname', async () => {
            vi.mocked(prisma.stockOpname.findUnique).mockResolvedValue({
                id: 'so-1',
                opnameNumber: 'SO-001',
                status: 'COUNTING',
            } as never);

            vi.mocked(prisma.warehouseOperationalAttachment.create).mockResolvedValue({
                id: 'att-opname',
            } as never);

            const result = await createWarehouseAttachment({
                stockOpnameId: 'so-1',
                checkpoint: 'OPNAME',
                documentType: 'PHOTO',
                storageKey: 'test/opname.jpg',
                url: '/api/images/test/opname.jpg',
            });

            expect(result.success).toBe(true);
            expect(prisma.warehouseOperationalAttachment.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        stockOpnameId: 'so-1',
                        checkpoint: 'OPNAME',
                    }),
                }),
            );
        });

        it('creates attachment for stock opname item (variance photo)', async () => {
            vi.mocked(prisma.stockOpnameItem.findUnique).mockResolvedValue({
                id: 'soi-1',
                opnameId: 'so-1',
            } as never);

            vi.mocked(prisma.stockOpname.findUnique).mockResolvedValue({
                id: 'so-1',
                opnameNumber: 'SO-001',
                status: 'COUNTING',
            } as never);

            vi.mocked(prisma.warehouseOperationalAttachment.create).mockResolvedValue({
                id: 'att-opname-item',
            } as never);

            const result = await createWarehouseAttachment({
                stockOpnameId: 'so-1',
                stockOpnameItemId: 'soi-1',
                checkpoint: 'OPNAME',
                documentType: 'PHOTO',
                storageKey: 'test/variance.jpg',
                url: '/api/images/test/variance.jpg',
            });

            expect(result.success).toBe(true);
        });

        it('creates attachment with BERITA_ACARA document type', async () => {
            vi.mocked(prisma.stockOpname.findUnique).mockResolvedValue({
                id: 'so-1',
                opnameNumber: 'SO-001',
                status: 'REVIEWING',
            } as never);

            vi.mocked(prisma.warehouseOperationalAttachment.create).mockResolvedValue({
                id: 'att-ba',
            } as never);

            const result = await createWarehouseAttachment({
                stockOpnameId: 'so-1',
                checkpoint: 'OPNAME',
                documentType: 'BERITA_ACARA',
                storageKey: 'test/ba.pdf',
                url: '/api/images/test/ba.pdf',
            });

            expect(result.success).toBe(true);
        });

        it('fails when no entity reference provided', async () => {
            const result = await createWarehouseAttachment({
                checkpoint: 'LOAD',
                documentType: 'PHOTO',
                storageKey: 'test/key.jpg',
                url: '/api/images/test/key.jpg',
            });

            expect(result.success).toBe(false);
        });

        it('fails when multiple entity references provided (non-opname pair)', async () => {
            const result = await createWarehouseAttachment({
                deliveryOrderId: 'do-1',
                goodsReceiptId: 'gr-1',
                checkpoint: 'LOAD',
                documentType: 'PHOTO',
                storageKey: 'test/key.jpg',
                url: '/api/images/test/key.jpg',
            });

            expect(result.success).toBe(false);
        });

        it('fails when delivery order not found', async () => {
            vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(null);

            const result = await createWarehouseAttachment({
                deliveryOrderId: 'do-nonexistent',
                checkpoint: 'LOAD',
                documentType: 'PHOTO',
                storageKey: 'test/key.jpg',
                url: '/api/images/test/key.jpg',
            });

            expect(result.success).toBe(false);
        });

        it('fails when delivery order status does not allow attachment', async () => {
            vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue({
                id: 'do-1',
                status: 'CANCELLED',
                orderNumber: 'DO-001',
            } as never);

            const result = await createWarehouseAttachment({
                deliveryOrderId: 'do-1',
                checkpoint: 'LOAD',
                documentType: 'PHOTO',
                storageKey: 'test/key.jpg',
                url: '/api/images/test/key.jpg',
            });

            expect(result.success).toBe(false);
        });

        it('fails when stock opname status does not allow attachment', async () => {
            vi.mocked(prisma.stockOpname.findUnique).mockResolvedValue({
                id: 'so-1',
                opnameNumber: 'SO-001',
                status: 'CLOSED',
            } as never);

            const result = await createWarehouseAttachment({
                stockOpnameId: 'so-1',
                checkpoint: 'OPNAME',
                documentType: 'PHOTO',
                storageKey: 'test/opname.jpg',
                url: '/api/images/test/opname.jpg',
            });

            expect(result.success).toBe(false);
        });

        it('allows attachment for SHIPPED delivery order', async () => {
            vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue({
                id: 'do-1',
                status: 'SHIPPED',
                orderNumber: 'DO-001',
            } as never);

            vi.mocked(prisma.warehouseOperationalAttachment.create).mockResolvedValue({
                id: 'att-3',
            } as never);

            const result = await createWarehouseAttachment({
                deliveryOrderId: 'do-1',
                checkpoint: 'LOAD',
                documentType: 'PHOTO',
                storageKey: 'test/key.jpg',
                url: '/api/images/test/key.jpg',
            });

            expect(result.success).toBe(true);
        });

        it('allows duplicate upload (same entity, same checkpoint)', async () => {
            vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue({
                id: 'do-1',
                status: 'LOADING',
                orderNumber: 'DO-001',
            } as never);

            vi.mocked(prisma.warehouseOperationalAttachment.create).mockResolvedValue({
                id: 'att-dup',
            } as never);

            const result = await createWarehouseAttachment({
                deliveryOrderId: 'do-1',
                checkpoint: 'LOAD',
                documentType: 'PHOTO',
                storageKey: 'test/another.jpg',
                url: '/api/images/test/another.jpg',
            });

            expect(result.success).toBe(true);
            expect(prisma.warehouseOperationalAttachment.create).toHaveBeenCalled();
        });
    });

    describe('deleteWarehouseAttachment', () => {
        it('deletes attachment when uploader matches', async () => {
            vi.mocked(prisma.warehouseOperationalAttachment.findUnique).mockResolvedValue({
                id: 'att-1',
                uploadedById: 'user-1',
                deliveryOrderId: 'do-1',
                goodsReceiptId: null,
                checkpoint: 'LOAD',
                documentType: 'PHOTO',
            } as never);

            vi.mocked(prisma.warehouseOperationalAttachment.delete).mockResolvedValue(
                {} as never,
            );

            const result = await deleteWarehouseAttachment('att-1');
            expect(result.success).toBe(true);
            expect(prisma.warehouseOperationalAttachment.delete).toHaveBeenCalledWith({
                where: { id: 'att-1' },
            });
        });

        it('fails when uploader does not match', async () => {
            vi.mocked(prisma.warehouseOperationalAttachment.findUnique).mockResolvedValue({
                id: 'att-1',
                uploadedById: 'other-user',
                deliveryOrderId: 'do-1',
                goodsReceiptId: null,
                checkpoint: 'LOAD',
                documentType: 'PHOTO',
            } as never);

            const result = await deleteWarehouseAttachment('att-1');
            expect(result.success).toBe(false);
        });

        it('fails when attachment not found', async () => {
            vi.mocked(prisma.warehouseOperationalAttachment.findUnique).mockResolvedValue(
                null,
            );

            const result = await deleteWarehouseAttachment('nonexistent');
            expect(result.success).toBe(false);
        });
    });

    describe('listWarehouseAttachments', () => {
        it('lists attachments for delivery order', async () => {
            const mockAttachments = [
                {
                    id: 'att-1',
                    checkpoint: 'LOAD',
                    documentType: 'PHOTO',
                    url: '/api/images/test/1.jpg',
                    createdAt: new Date(),
                    uploadedBy: { id: 'user-1', name: 'Test' },
                },
            ];

            vi.mocked(prisma.warehouseOperationalAttachment.findMany).mockResolvedValue(
                mockAttachments as never,
            );

            const result = await listWarehouseAttachments({
                deliveryOrderId: 'do-1',
            });

            expect(result.success).toBe(true);
            expect(result).toMatchObject({
                success: true,
                data: mockAttachments,
            });
            expect(Array.isArray(result.success ? result.data : null)).toBe(
                true,
            );
            expect(
                prisma.warehouseOperationalAttachment.findMany,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { deliveryOrderId: 'do-1' },
                }),
            );
        });

        it('lists attachments for purchase order', async () => {
            vi.mocked(prisma.warehouseOperationalAttachment.findMany).mockResolvedValue(
                [] as never,
            );

            const result = await listWarehouseAttachments({
                purchaseOrderId: 'po-1',
            });

            expect(result.success).toBe(true);
            expect(
                prisma.warehouseOperationalAttachment.findMany,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { purchaseOrderId: 'po-1' },
                }),
            );
        });

        it('lists attachments for stock opname', async () => {
            vi.mocked(prisma.warehouseOperationalAttachment.findMany).mockResolvedValue(
                [] as never,
            );

            const result = await listWarehouseAttachments({
                stockOpnameId: 'so-1',
            });

            expect(result.success).toBe(true);
            expect(
                prisma.warehouseOperationalAttachment.findMany,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { stockOpnameId: 'so-1' },
                }),
            );
        });
    });

    describe('migrateAttachmentsToGoodsReceipt', () => {
        it('migrates PO attachments to GR', async () => {
            vi.mocked(prisma.warehouseOperationalAttachment.updateMany).mockResolvedValue({
                count: 3,
            } as never);

            const result = await migrateAttachmentsToGoodsReceipt({
                purchaseOrderId: 'po-1',
                goodsReceiptId: 'gr-1',
            });

            expect(result.success).toBe(true);
            expect(
                prisma.warehouseOperationalAttachment.updateMany,
            ).toHaveBeenCalledWith({
                where: { purchaseOrderId: 'po-1' },
                data: {
                    goodsReceiptId: 'gr-1',
                    purchaseOrderId: null,
                },
            });
        });

        it('returns 0 migrated when no attachments exist', async () => {
            vi.mocked(prisma.warehouseOperationalAttachment.updateMany).mockResolvedValue({
                count: 0,
            } as never);

            const result = await migrateAttachmentsToGoodsReceipt({
                purchaseOrderId: 'po-empty',
                goodsReceiptId: 'gr-1',
            });

            expect(result.success).toBe(true);
        });
    });
});
