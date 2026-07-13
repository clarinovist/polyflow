import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
    headers: vi.fn().mockResolvedValue({
        get: (_name: string) => null,
    }),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn().mockResolvedValue({
        user: { id: 'user-1', name: 'Test User' },
    }),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        bom: {
            findUnique: vi.fn(),
            create: vi.fn(),
            updateMany: vi.fn(),
        },
        productVariant: {
            findUnique: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

vi.mock('@/services/production/bom-cost-cascade-service', () => ({
    BomCostCascadeService: {
        validateNoBomCycle: vi.fn(),
        cascadeFromVariants: vi.fn().mockResolvedValue({
            updatedCount: 0,
            updatedVariantIds: [],
        }),
    },
}));

vi.mock('@/actions/finance/cost-history', () => ({
    updateStandardCost: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: vi.fn((data) => data),
}));

vi.mock('@/lib/utils/production-utils', () => ({
    calculateBomCost: vi.fn(() => 100),
}));

// ── Imports AFTER mocks ──────────────────────────────────
import { duplicateBom } from '@/actions/production/boms';
import { prisma } from '@/lib/core/prisma';

// ── Test data ────────────────────────────────────────────
const SOURCE_BOM = {
    id: 'bom-source-1',
    name: 'Rafia Hitam KW 1,0',
    productVariantId: 'pv-kw10',
    outputQuantity: 1,
    category: 'STANDARD',
    description: 'BOM acuan',
    isDefault: true,
    items: [
        { id: 'item-1', productVariantId: 'pv-pp', quantity: 1.0, scrapPercentage: 3 },
        { id: 'item-2', productVariantId: 'pv-color', quantity: 0.02, scrapPercentage: 0 },
    ],
};

const TARGET_VARIANT = {
    id: 'pv-kw05',
    name: 'Rafia Hitam KW 0,5',
    skuCode: 'RAF-BLACK-KW05',
};

// Cast prisma methods to vi.fn() for type safety
const mockPrisma = prisma as unknown as {
    bom: {
        findUnique: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        updateMany: ReturnType<typeof vi.fn>;
    };
    productVariant: {
        findUnique: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
};

// ── Tests ────────────────────────────────────────────────
describe('duplicateBom action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('source not found throws error', async () => {
        mockPrisma.bom.findUnique.mockResolvedValue(null);

        const result = await duplicateBom({
            sourceBomId: 'nonexistent',
            productVariantId: 'pv-kw05',
            name: 'Test',
            quantityScale: 1,
            isDefault: true,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain('not found');
        }
    });

    it('source with empty items throws error', async () => {
        mockPrisma.bom.findUnique.mockResolvedValue({
            ...SOURCE_BOM,
            items: [],
        });

        const result = await duplicateBom({
            sourceBomId: 'bom-source-1',
            productVariantId: 'pv-kw05',
            name: 'Test',
            quantityScale: 1,
            isDefault: true,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain('no ingredients');
        }
    });

    it('isDefault true unsets previous defaults on target', async () => {
        const mockCreateResult = {
            id: 'bom-new-1',
            name: 'Salinan',
            productVariantId: 'pv-kw05',
            outputQuantity: 1,
            isDefault: true,
            category: 'STANDARD',
            items: SOURCE_BOM.items,
        };

        const mockTx = {
            bom: {
                updateMany: vi.fn().mockResolvedValue({ count: 1 }),
                create: vi.fn().mockResolvedValue(mockCreateResult),
            },
        };

        mockPrisma.$transaction.mockImplementation(
            async (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx)
        );

        // First call: source load, Second call: created bom with items
        mockPrisma.bom.findUnique
            .mockResolvedValueOnce(SOURCE_BOM)
            .mockResolvedValueOnce({
                ...SOURCE_BOM,
                id: 'bom-new-1',
                productVariantId: 'pv-kw05',
                items: SOURCE_BOM.items,
            });

        mockPrisma.productVariant.findUnique.mockResolvedValue(TARGET_VARIANT);

        const result = await duplicateBom({
            sourceBomId: 'bom-source-1',
            productVariantId: 'pv-kw05',
            name: 'Salinan - KW 0,5',
            quantityScale: 0.5,
            isDefault: true,
        });

        expect(result.success).toBe(true);

        // Verify unsetOtherDefaultBoms was called inside tx
        expect(mockTx.bom.updateMany).toHaveBeenCalledWith({
            where: {
                productVariantId: 'pv-kw05',
                isDefault: true,
            },
            data: { isDefault: false },
        });

        // Verify create was called with scaled items
        const createCall = mockTx.bom.create.mock.calls[0][0];
        expect(createCall.data.items.create[0].quantity).toBe(0.5); // 1.0 * 0.5
        expect(createCall.data.items.create[0].scrapPercentage).toBe(3); // unchanged
        expect(createCall.data.items.create[1].quantity).toBe(0.01); // 0.02 * 0.5
        expect(createCall.data.category).toBe('STANDARD'); // copied from source
    });

    it('isDefault false does NOT unset previous defaults', async () => {
        const mockCreateResult = {
            id: 'bom-new-1',
            name: 'Alt',
            productVariantId: 'pv-kw05',
            outputQuantity: 1,
            isDefault: false,
            category: 'STANDARD',
            items: SOURCE_BOM.items,
        };

        const mockTx = {
            bom: {
                updateMany: vi.fn().mockResolvedValue({ count: 0 }),
                create: vi.fn().mockResolvedValue(mockCreateResult),
            },
        };

        mockPrisma.$transaction.mockImplementation(
            async (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx)
        );

        mockPrisma.bom.findUnique
            .mockResolvedValueOnce(SOURCE_BOM)
            .mockResolvedValueOnce({
                ...SOURCE_BOM,
                id: 'bom-new-1',
                items: SOURCE_BOM.items,
            });

        mockPrisma.productVariant.findUnique.mockResolvedValue(TARGET_VARIANT);

        const result = await duplicateBom({
            sourceBomId: 'bom-source-1',
            productVariantId: 'pv-kw05',
            name: 'Alt Formula',
            quantityScale: 1,
            isDefault: false,
        });

        expect(result.success).toBe(true);
        // Should NOT call updateMany to unset defaults
        expect(mockTx.bom.updateMany).not.toHaveBeenCalled();
    });
});
