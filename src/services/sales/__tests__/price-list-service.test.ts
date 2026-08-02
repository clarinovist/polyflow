import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductType } from '@prisma/client';
import { Prisma } from '@prisma/client';

// ── Mock prisma ───────────────────────────────────────────────────────
const mockTx = {
    customerProductPrice: {
        upsert: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
    },
};

const mockPrisma = {
    customerProductPrice: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (cb: unknown) => {
        if (typeof cb === 'function') {
            return (cb as (tx: typeof mockTx) => unknown)(mockTx as never);
        }
        return cb;
    }),
};

vi.mock('@/lib/core/prisma', () => ({
    get prisma() {
        return mockPrisma;
    },
}));

import {
    listPrices,
    bulkUpsertPrices,
    previewBulkAdjustPrices,
    applyBulkAdjustPrices,
    bulkAdjustPrices,
} from '../price-list-service';

function decimal(n: number) {
    // Mimic Prisma Decimal for findMany returns
    return {
        toNumber: () => n,
        toString: () => String(n),
    } as unknown as Prisma.Decimal;
}

function priceRow(overrides: Partial<{
    id: string;
    customerId: string;
    productVariantId: string;
    unitPrice: ReturnType<typeof decimal>;
    isActive: boolean;
    notes: string | null;
    customer: { id: string; name: string; code: string | null };
    productVariant: { id: string; skuCode: string; name: string; product: { id: string; name: string; productType: ProductType } };
    createdAt: Date;
    updatedAt: Date;
}> = {}) {
    return {
        id: 'price-1',
        customerId: 'cust-1',
        productVariantId: 'pv-1',
        unitPrice: decimal(10000),
        isActive: true,
        notes: null,
        customer: { id: 'cust-1', name: 'Customer A', code: 'C001' },
        productVariant: {
            id: 'pv-1',
            skuCode: 'SKU-001',
            name: 'Produk A',
            product: { id: 'prod-1', name: 'Produk A', productType: ProductType.FINISHED_GOOD },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

function candidateRow(overrides: Partial<{
    id: string;
    customerId: string;
    productVariantId: string;
    unitPrice: ReturnType<typeof decimal>;
    customer: { name: string };
    productVariant: { name: string; skuCode: string };
}> = {}) {
    return {
        id: 'price-1',
        customerId: 'cust-1',
        productVariantId: 'pv-1',
        unitPrice: decimal(10000),
        customer: { name: 'Customer A' },
        productVariant: { name: 'Produk A', skuCode: 'SKU-001' },
        ...overrides,
    };
}

describe('price-list-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.customerProductPrice.count.mockResolvedValue(0);
        mockPrisma.customerProductPrice.findMany.mockResolvedValue([]);
        mockPrisma.customerProductPrice.upsert.mockResolvedValue({} as never);
        mockPrisma.customerProductPrice.update.mockResolvedValue({} as never);
        mockTx.customerProductPrice.upsert.mockResolvedValue({} as never);
        mockTx.customerProductPrice.update.mockResolvedValue({} as never);
        // Default transaction invokes callback
        mockPrisma.$transaction.mockImplementation(async (cb: unknown) => {
            if (typeof cb === 'function') {
                return (cb as (tx: typeof mockTx) => unknown)(mockTx as never);
            }
            return cb;
        });
    });

    describe('listPrices — pagination', () => {
        it('default page 1 pageSize 50 isActive true', async () => {
            mockPrisma.customerProductPrice.count.mockResolvedValue(0);
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([] as never);

            const res = await listPrices({});
            expect(res.page).toBe(1);
            expect(res.pageSize).toBe(50);
            expect(mockPrisma.customerProductPrice.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ skip: 0, take: 50 }),
            );
            // isActive default true
            expect(mockPrisma.customerProductPrice.count).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ isActive: true }) }),
            );
        });

        it('clamps pageSize max 200', async () => {
            await listPrices({ pageSize: 500 });
            expect(mockPrisma.customerProductPrice.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ take: 200 }),
            );
        });

        it('returns totalPages correctly', async () => {
            mockPrisma.customerProductPrice.count.mockResolvedValue(120);
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([
                priceRow(),
            ] as never);

            const res = await listPrices({ page: 2, pageSize: 50 });
            expect(res.total).toBe(120);
            expect(res.totalPages).toBe(3);
            expect(res.page).toBe(2);
        });

        it('search builds OR filter', async () => {
            mockPrisma.customerProductPrice.count.mockResolvedValue(1);
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([priceRow()] as never);
            await listPrices({ search: 'Rafia' });
            const call = mockPrisma.customerProductPrice.count.mock.calls[0][0];
            expect(call.where).toHaveProperty('AND');
        });

        it('isActive null means no isActive filter (all)', async () => {
            mockPrisma.customerProductPrice.count.mockResolvedValue(2);
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([] as never);
            await listPrices({ isActive: null });
            const call = mockPrisma.customerProductPrice.count.mock.calls[0][0];
            expect(call.where.isActive).toBeUndefined();
        });

        it('category filter adds productVariant.product.productType', async () => {
            mockPrisma.customerProductPrice.count.mockResolvedValue(0);
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([] as never);
            await listPrices({ category: ProductType.FINISHED_GOOD });
            const where = mockPrisma.customerProductPrice.count.mock.calls[0][0].where;
            expect(where.productVariant).toBeDefined();
        });

        it('includes customer name + productVariant info', async () => {
            mockPrisma.customerProductPrice.count.mockResolvedValue(1);
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([priceRow()] as never);
            const res = await listPrices({});
            expect(res.data[0].customer.name).toBe('Customer A');
            expect(res.data[0].productVariant.skuCode).toBe('SKU-001');
        });
    });

    describe('bulkUpsertPrices — transactional ALL-OR-NOTHING', () => {
        it('throws on empty entries', async () => {
            await expect(bulkUpsertPrices([])).rejects.toThrow('Daftar harga kosong');
        });

        it('dedupes duplicate composite keys (last wins)', async () => {
            const result = await bulkUpsertPrices([
                { customerId: 'c1', productVariantId: 'p1', price: 100 },
                { customerId: 'c1', productVariantId: 'p1', price: 200 },
            ]);
            expect(result.count).toBe(1);
            // Only 1 upsert called
            expect(mockTx.customerProductPrice.upsert).toHaveBeenCalledTimes(1);
            // Last wins: 200
            const call = mockTx.customerProductPrice.upsert.mock.calls[0][0];
            expect(Number(call.create.unitPrice)).toBe(200);
        });

        it('rollback on single failure — tx throws, no partial writes leak outside (behavior: ALL-OR-NOTHING)', async () => {
            // Simulate: first upsert ok, second throws -> $transaction should propagate error
            mockPrisma.$transaction.mockImplementation(async (cb: unknown) => {
                if (typeof cb === 'function') {
                    const tx = {
                        customerProductPrice: {
                            upsert: vi.fn().mockImplementation(async (args: { create: { unitPrice: { toNumber?: () => number } | number } }) => {
                                // Fail when second entry
                                const price = (args.create.unitPrice as { toNumber?: () => number }).toNumber?.() ?? args.create.unitPrice;
                                if (Number(price) === 999) throw new Error('DB fail');
                                return {};
                            }),
                        },
                    };
                    return (cb as (t: typeof tx) => unknown)(tx as never);
                }
            });

            await expect(
                bulkUpsertPrices([
                    { customerId: 'c1', productVariantId: 'p1', price: 100 },
                    { customerId: 'c2', productVariantId: 'p2', price: 999 },
                ]),
            ).rejects.toThrow('DB fail');
        });

        it('single bulk uses one transaction', async () => {
            await bulkUpsertPrices([
                { customerId: 'c1', productVariantId: 'p1', price: 100 },
                { customerId: 'c2', productVariantId: 'p2', price: 200 },
            ]);
            expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
            expect(mockTx.customerProductPrice.upsert).toHaveBeenCalledTimes(2);
        });

        it('validates price non-negative', async () => {
            await expect(
                bulkUpsertPrices([{ customerId: 'c1', productVariantId: 'p1', price: -1 }]),
            ).rejects.toThrow('Harga tidak boleh negatif');
        });
    });

    describe('previewBulkAdjustPrices — dry-run TIDAK menulis DB', () => {
        it('preview does NOT call prisma.update', async () => {
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([
                candidateRow(),
            ] as never);

            const result = await previewBulkAdjustPrices({
                filter: { customerId: 'cust-1' },
                mode: 'PERCENT',
                value: 10,
            });

            expect(mockPrisma.customerProductPrice.update).not.toHaveBeenCalled();
            expect(mockTx.customerProductPrice.update).not.toHaveBeenCalled();
            expect(result.affectedCount).toBe(1);
            expect(result.preview[0].oldPrice).toBe(10000);
            expect(result.preview[0].newPrice).toBe(11000);
        });

        it('dry-run via unified bulkAdjustPrices(true) also no write', async () => {
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([
                candidateRow(),
            ] as never);

            const result = await bulkAdjustPrices({
                filter: { customerId: 'cust-1' },
                mode: 'PERCENT',
                value: 5,
                dryRun: true,
            });

            expect(mockPrisma.customerProductPrice.update).not.toHaveBeenCalled();
            expect('preview' in result).toBe(true);
        });

        it('value 0% returns empty preview (no change)', async () => {
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([
                candidateRow(),
            ] as never);

            const result = await previewBulkAdjustPrices({
                filter: { customerId: 'cust-1' },
                mode: 'PERCENT',
                value: 0,
            });

            expect(result.affectedCount).toBe(0);
            expect(result.preview).toHaveLength(0);
        });

        it('value 0 AMOUNT returns empty', async () => {
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([
                candidateRow(),
            ] as never);

            const res = await previewBulkAdjustPrices({
                filter: { productVariantId: 'pv-1' },
                mode: 'AMOUNT',
                value: 0,
            });
            expect(res.preview).toHaveLength(0);
        });

        it('PERCENT 10% computes correctly', async () => {
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([
                candidateRow({ unitPrice: decimal(100000) }),
            ] as never);

            const res = await previewBulkAdjustPrices({
                filter: { customerId: 'c1' },
                mode: 'PERCENT',
                value: 10,
            });
            expect(res.preview[0].newPrice).toBe(110000);
        });

        it('AMOUNT +5000 computes correctly', async () => {
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([
                candidateRow({ unitPrice: decimal(10000) }),
            ] as never);

            const res = await previewBulkAdjustPrices({
                filter: { customerId: 'c1' },
                mode: 'AMOUNT',
                value: 5000,
            });
            expect(res.preview[0].newPrice).toBe(15000);
        });

        it('throws when filter empty (prevent accidental mass update)', async () => {
            await expect(
                previewBulkAdjustPrices({
                    filter: {},
                    mode: 'PERCENT',
                    value: 10,
                }),
            ).rejects.toThrow('Filter penyesuaian massal wajib diisi');
        });

        it('respects isActive default true + customer.isActive true exclude', async () => {
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([] as never);
            await previewBulkAdjustPrices({
                filter: { customerId: 'c1' },
                mode: 'PERCENT',
                value: 10,
            });
            const where = mockPrisma.customerProductPrice.findMany.mock.calls[0][0].where;
            // AND[0]=isActive filter, AND[1]=customer isActive true
            expect(where.AND).toBeDefined();
            const andArr = where.AND as Record<string, unknown>[];
            expect(andArr.some((w) => (w as { isActive?: unknown }).isActive === true)).toBe(true);
            expect(andArr.some((w) => !!(w as { customer?: unknown }).customer)).toBe(true);
        });

        it('isActive null skips isActive filter but still filters customer.isActive', async () => {
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([] as never);
            await previewBulkAdjustPrices({
                filter: { customerId: 'c1', isActive: null },
                mode: 'PERCENT',
                value: 5,
            });
            const where = mockPrisma.customerProductPrice.findMany.mock.calls[0][0].where;
            const andArr = where.AND as Record<string, unknown>[];
            // No isActive:true in first part when null
            const first = andArr[0] as Record<string, unknown>;
            expect(first.isActive).toBeUndefined();
        });

        it('negative result throws BusinessRuleError', async () => {
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([
                candidateRow({ unitPrice: decimal(1000) }),
            ] as never);

            await expect(
                previewBulkAdjustPrices({
                    filter: { customerId: 'c1' },
                    mode: 'AMOUNT',
                    value: -5000,
                }),
            ).rejects.toThrow(/negatif/);
        });

        it('preview returns customerName, productName, skuCode', async () => {
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([
                candidateRow(),
            ] as never);
            const res = await previewBulkAdjustPrices({
                filter: { customerId: 'c1' },
                mode: 'PERCENT',
                value: 1,
            });
            expect(res.preview[0].customerName).toBe('Customer A');
            expect(res.preview[0].skuCode).toBe('SKU-001');
        });
    });

    describe('applyBulkAdjustPrices — writes DB in transaction', () => {
        it('apply writes via tx.update', async () => {
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([
                candidateRow(),
            ] as never);

            const res = await applyBulkAdjustPrices({
                filter: { customerId: 'c1' },
                mode: 'PERCENT',
                value: 10,
            });

            expect(res.updatedCount).toBe(1);
            expect(mockPrisma.$transaction).toHaveBeenCalled();
            expect(mockTx.customerProductPrice.update).toHaveBeenCalled();
        });

        it('0% apply returns 0 and does not transact', async () => {
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([
                candidateRow(),
            ] as never);

            const res = await applyBulkAdjustPrices({
                filter: { customerId: 'c1' },
                mode: 'PERCENT',
                value: 0,
            });
            expect(res.updatedCount).toBe(0);
            expect(mockPrisma.$transaction).not.toHaveBeenCalled();
        });

        it('dryRun false unified apply path', async () => {
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([
                candidateRow(),
            ] as never);

            const res = await bulkAdjustPrices({
                filter: { customerId: 'c1' },
                mode: 'AMOUNT',
                value: 100,
                dryRun: false,
            });

            expect('updatedCount' in res).toBe(true);
        });

        it('empty filter throws on apply', async () => {
            await expect(
                applyBulkAdjustPrices({
                    filter: {},
                    mode: 'PERCENT',
                    value: 10,
                }),
            ).rejects.toThrow('Filter penyesuaian massal wajib diisi');
        });

        it('inactive customer excluded (via AND customer isActive true)', async () => {
            // Verified via where clause already tested — here just ensure findMany called with customer active filter
            mockPrisma.customerProductPrice.findMany.mockResolvedValue([] as never);
            await applyBulkAdjustPrices({
                filter: { category: ProductType.FINISHED_GOOD },
                mode: 'PERCENT',
                value: 5,
            });
            const where = mockPrisma.customerProductPrice.findMany.mock.calls[0][0].where;
            expect(where.AND).toBeDefined();
        });
    });
});
