import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/errors/errors', () => ({
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            const data = await fn();
            return { success: true as const, data };
        } catch (e) {
            if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e;
            return {
                success: false as const,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    },
    BusinessRuleError: class BusinessRuleError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'BusinessRuleError';
        }
    },
}));

vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('@/lib/schemas/product', () => ({
    createProductSchema: { safeParse: (d: unknown) => ({ success: true, data: d }) },
    updateProductSchema: { safeParse: (d: unknown) => ({ success: true, data: d }) },
}));

const { mockProductVariant, mockProduct, mockCounts, mockTransaction } =
    vi.hoisted(() => {
        const counters = [
            'inventory',
            'stockMovement',
            'batch',
            'bomItem',
            'materialIssue',
            'scrapRecord',
            'stockReservation',
            'stockOpnameItem',
            'productionMaterial',
            'bom',
        ] as const;
        const mockCounts = Object.fromEntries(
            counters.map((name) => [name, { count: vi.fn() }]),
        ) as Record<(typeof counters)[number], { count: ReturnType<typeof vi.fn> }>;

        return {
            mockProductVariant: {
                findUnique: vi.fn(),
                findMany: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
                deleteMany: vi.fn(),
                create: vi.fn(),
                createMany: vi.fn(),
            },
            mockProduct: { create: vi.fn(), delete: vi.fn() },
            mockCounts,
            mockTransaction: vi.fn(),
        };
    });

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productVariant: mockProductVariant,
        product: mockProduct,
        ...mockCounts,
        $transaction: mockTransaction,
    },
}));

import {
    archiveVariant,
    unarchiveVariant,
    deleteVariant,
    deleteProduct,
    quickCreateProduct,
    createProduct,
} from '../product-mutations';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logActivity } from '@/lib/tools/audit';

const SESSION = { user: { id: 'user-1' } };

/** Semua tabel referensi mengembalikan 0 → varian/produk dianggap bersih. */
function stubNoReferences() {
    for (const model of Object.values(mockCounts)) {
        model.count.mockResolvedValue(0);
    }
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(SESSION as never);
    mockProductVariant.update.mockResolvedValue({});
    mockProductVariant.delete.mockResolvedValue({});
    mockProductVariant.deleteMany.mockResolvedValue({ count: 0 });
    mockProduct.delete.mockResolvedValue({});
    mockProductVariant.createMany.mockResolvedValue({ count: 1 });
    stubNoReferences();
    // Jalankan callback transaksi dengan client tx yang sama dengan mock prisma.
    mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
            await fn({
                product: mockProduct,
                productVariant: mockProductVariant,
            }),
    );
});

describe('archiveVariant', () => {
    it('sets archivedAt and logs activity for an active variant', async () => {
        mockProductVariant.findUnique.mockResolvedValue({
            id: 'v1',
            skuCode: 'SKU1',
            archivedAt: null,
        });

        const res = await archiveVariant('v1');

        expect(res.success).toBe(true);
        expect(mockProductVariant.update).toHaveBeenCalledWith({
            where: { id: 'v1' },
            data: { archivedAt: expect.any(Date) },
        });
        expect(logActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'ARCHIVE_PRODUCT_VARIANT',
                entityId: 'v1',
            }),
        );
    });

    it('rejects when variant not found', async () => {
        mockProductVariant.findUnique.mockResolvedValue(null);

        const res = await archiveVariant('missing');

        expect(res.success).toBe(false);
        expect(mockProductVariant.update).not.toHaveBeenCalled();
    });

    it('rejects when variant already archived', async () => {
        mockProductVariant.findUnique.mockResolvedValue({
            id: 'v1',
            skuCode: 'SKU1',
            archivedAt: new Date(),
        });

        const res = await archiveVariant('v1');

        expect(res.success).toBe(false);
        expect(mockProductVariant.update).not.toHaveBeenCalled();
    });
});

describe('unarchiveVariant', () => {
    it('clears archivedAt and logs activity for an archived variant', async () => {
        mockProductVariant.findUnique.mockResolvedValue({
            id: 'v1',
            skuCode: 'SKU1',
            archivedAt: new Date(),
        });

        const res = await unarchiveVariant('v1');

        expect(res.success).toBe(true);
        expect(mockProductVariant.update).toHaveBeenCalledWith({
            where: { id: 'v1' },
            data: { archivedAt: null },
        });
        expect(logActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'UNARCHIVE_PRODUCT_VARIANT',
                entityId: 'v1',
            }),
        );
    });

    it('rejects when variant is not archived', async () => {
        mockProductVariant.findUnique.mockResolvedValue({
            id: 'v1',
            skuCode: 'SKU1',
            archivedAt: null,
        });

        const res = await unarchiveVariant('v1');

        expect(res.success).toBe(false);
        expect(mockProductVariant.update).not.toHaveBeenCalled();
    });

    it('rejects when variant not found', async () => {
        mockProductVariant.findUnique.mockResolvedValue(null);

        const res = await unarchiveVariant('missing');

        expect(res.success).toBe(false);
        expect(mockProductVariant.update).not.toHaveBeenCalled();
    });
});

describe('deleteVariant', () => {
    it('hard-deletes a variant with no references and logs activity', async () => {
        const res = await deleteVariant('v1');

        expect(res.success).toBe(true);
        expect(mockProductVariant.delete).toHaveBeenCalledWith({
            where: { id: 'v1' },
        });
        expect(logActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'DELETE_PRODUCT_VARIANT',
                entityId: 'v1',
            }),
        );
    });

    it('refuses to delete a referenced variant and names each table', async () => {
        mockCounts.inventory.count.mockResolvedValue(2);
        mockCounts.stockMovement.count.mockResolvedValue(5);
        mockCounts.bom.count.mockResolvedValue(1);

        const res = await deleteVariant('v1');

        expect(res.success).toBe(false);
        if (res.success) throw new Error('expected failure');
        expect(res.error).toContain('Inventory (2)');
        expect(res.error).toContain('StockMovement (5)');
        expect(res.error).toContain('Bom (1)');
        expect(mockProductVariant.delete).not.toHaveBeenCalled();
    });

    it('maps an unexpected prisma failure to a business rule error', async () => {
        mockProductVariant.delete.mockRejectedValue(new Error('db down'));

        const res = await deleteVariant('v1');

        expect(res.success).toBe(false);
        if (res.success) throw new Error('expected failure');
        expect(res.error).toContain('Failed to delete variant');
    });
});

describe('deleteProduct', () => {
    it('deletes the product and all of its unreferenced variants', async () => {
        mockProductVariant.findMany.mockResolvedValue([
            { id: 'v1', skuCode: 'SKU1' },
            { id: 'v2', skuCode: 'SKU2' },
        ]);

        const res = await deleteProduct('p1');

        expect(res.success).toBe(true);
        expect(mockProductVariant.deleteMany).toHaveBeenCalledWith({
            where: { id: { in: ['v1', 'v2'] } },
        });
        expect(mockProduct.delete).toHaveBeenCalledWith({
            where: { id: 'p1' },
        });
        expect(logActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'DELETE_PRODUCT',
                entityId: 'p1',
            }),
        );
    });

    it('skips the reference checks when the product has no variants', async () => {
        mockProductVariant.findMany.mockResolvedValue([]);

        const res = await deleteProduct('p1');

        expect(res.success).toBe(true);
        expect(mockCounts.inventory.count).not.toHaveBeenCalled();
        expect(mockProductVariant.deleteMany).not.toHaveBeenCalled();
        expect(mockProduct.delete).toHaveBeenCalledWith({
            where: { id: 'p1' },
        });
    });

    it('refuses when any variant is still referenced', async () => {
        mockProductVariant.findMany.mockResolvedValue([
            { id: 'v1', skuCode: 'SKU1' },
        ]);
        mockCounts.stockOpnameItem.count.mockResolvedValue(3);

        const res = await deleteProduct('p1');

        expect(res.success).toBe(false);
        if (res.success) throw new Error('expected failure');
        expect(res.error).toContain('StockOpnameItem (3)');
        expect(mockProduct.delete).not.toHaveBeenCalled();
    });
});

describe('quickCreateProduct', () => {
    const INPUT = {
        productName: 'Rafia Hitam',
        variantName: 'Roll 500g',
        skuCode: 'fgrol010',
        primaryUnit: 'ROLL',
        sellPrice: 15000,
    };

    it('creates product + variant, uppercasing the SKU', async () => {
        mockProductVariant.findUnique.mockResolvedValue(null);
        mockProduct.create.mockResolvedValue({
            id: 'p1',
            name: 'Rafia Hitam',
        });
        mockProductVariant.create.mockResolvedValue({
            id: 'v1',
            name: 'Roll 500g',
            skuCode: 'FGROL010',
        });

        const res = await quickCreateProduct(INPUT);

        expect(res.success).toBe(true);
        if (!res.success) throw new Error('expected success');
        expect(res.data).toEqual(
            expect.objectContaining({
                id: 'v1',
                skuCode: 'FGROL010',
                productName: 'Rafia Hitam',
                sellPrice: 15000,
            }),
        );
        expect(mockProductVariant.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    productId: 'p1',
                    skuCode: 'FGROL010',
                }),
            }),
        );
    });

    it('falls back to the product name when variant name is blank', async () => {
        mockProductVariant.findUnique.mockResolvedValue(null);
        mockProduct.create.mockResolvedValue({
            id: 'p1',
            name: 'Rafia Hitam',
        });
        mockProductVariant.create.mockResolvedValue({
            id: 'v1',
            name: 'Rafia Hitam',
            skuCode: 'FGROL010',
        });

        const res = await quickCreateProduct({ ...INPUT, variantName: '  ' });

        expect(res.success).toBe(true);
        expect(mockProductVariant.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ name: 'Rafia Hitam' }),
            }),
        );
    });

    it('rejects a duplicate SKU without touching the transaction', async () => {
        mockProductVariant.findUnique.mockResolvedValue({ id: 'existing' });

        const res = await quickCreateProduct(INPUT);

        expect(res.success).toBe(false);
        if (res.success) throw new Error('expected failure');
        expect(res.error).toContain('FGROL010');
        expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('rejects a blank product name', async () => {
        const res = await quickCreateProduct({ ...INPUT, productName: '   ' });

        expect(res.success).toBe(false);
        expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('rejects a blank SKU', async () => {
        const res = await quickCreateProduct({ ...INPUT, skuCode: '' });

        expect(res.success).toBe(false);
        expect(mockTransaction).not.toHaveBeenCalled();
    });
});


describe('createProduct', () => {
    const INPUT = {
        name: 'Rafia Hitam',
        productType: 'FINISHED_GOOD',
        variants: [
            {
                name: 'Roll 500g',
                skuCode: 'FGROL011',
                primaryUnit: 'ROLL',
                salesUnit: '',
                conversionFactor: 1,
                price: 15000,
                buyPrice: null,
                minStockAlert: null,
                packagingContainerSize: null,
            },
        ],
    } as never;

    it('creates the product with its variants and logs activity', async () => {
        mockProductVariant.findMany.mockResolvedValue([]);
        mockProduct.create.mockResolvedValue({ id: 'p1', name: 'Rafia Hitam' });

        const res = await createProduct(INPUT);

        expect(res.success).toBe(true);
        expect(mockProductVariant.createMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: [
                    expect.objectContaining({
                        productId: 'p1',
                        skuCode: 'FGROL011',
                        // salesUnit kosong jatuh balik ke primaryUnit
                        salesUnit: 'ROLL',
                    }),
                ],
            }),
        );
        expect(logActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'CREATE_PRODUCT',
                entityId: 'p1',
            }),
        );
    });

    it('refuses when any SKU already exists', async () => {
        mockProductVariant.findMany.mockResolvedValue([
            { skuCode: 'FGROL011' },
        ]);

        const res = await createProduct(INPUT);

        expect(res.success).toBe(false);
        if (res.success) throw new Error('expected failure');
        expect(res.error).toContain('FGROL011');
        expect(mockProduct.create).not.toHaveBeenCalled();
    });

    it('maps an unexpected prisma failure to a business rule error', async () => {
        mockProductVariant.findMany.mockResolvedValue([]);
        mockProduct.create.mockRejectedValue(new Error('db down'));

        const res = await createProduct(INPUT);

        expect(res.success).toBe(false);
        if (res.success) throw new Error('expected failure');
        expect(res.error).toContain('Failed to create product');
    });
});
