import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', () => {
    const standardCostMap: Record<string, number> = {
        'mix-out': 100,
        'ext-out': 200,
        'pack-out': 500,
    };

    const bomById = {
        'bom-ext': {
            id: 'bom-ext',
            productVariantId: 'ext-out',
            outputQuantity: 1,
            items: [
                {
                    quantity: 1,
                    scrapPercentage: 0,
                    productVariant: {
                        standardCost: { toNumber: () => standardCostMap['mix-out'] },
                        buyPrice: null,
                        price: null,
                        inventories: [],
                    },
                },
            ],
        },
        'bom-pack': {
            id: 'bom-pack',
            productVariantId: 'pack-out',
            outputQuantity: 1,
            items: [
                {
                    quantity: 1,
                    scrapPercentage: 0,
                    productVariant: {
                        standardCost: { toNumber: () => standardCostMap['ext-out'] },
                        buyPrice: null,
                        price: null,
                        inventories: [],
                    },
                },
                {
                    quantity: 2,
                    scrapPercentage: 0,
                    productVariant: {
                        standardCost: { toNumber: () => 50 },
                        buyPrice: null,
                        price: null,
                        inventories: [],
                    },
                },
            ],
        },
    };

    const mockPrisma = {
        bom: {
            findMany: vi.fn(async (args: {
                where?: {
                    productVariantId?: string;
                    id?: { not?: string };
                    items?: { some?: { productVariantId?: { in?: string[] } } };
                }
            }) => {
                const byOutputVariant = args?.where?.productVariantId;
                if (byOutputVariant) {
                    if (byOutputVariant === 'mix-mid') {
                        return [{ id: 'bom-mid', items: [{ productVariantId: 'mix-root' }] }];
                    }
                    if (byOutputVariant === 'mix-root') {
                        return [{ id: 'bom-root', items: [{ productVariantId: 'mix-mid' }] }];
                    }
                    return [];
                }

                const ingredientFrontier = args?.where?.items?.some?.productVariantId?.in || [];
                const result = [] as Array<(typeof bomById)[keyof typeof bomById]>;

                if (ingredientFrontier.includes('mix-out')) {
                    result.push(bomById['bom-ext']);
                }
                if (ingredientFrontier.includes('ext-out')) {
                    result.push(bomById['bom-pack']);
                }

                return result;
            }),
        },
        productVariant: {
            findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
                const value = standardCostMap[where.id];
                if (value === undefined) return null;
                return {
                    standardCost: { toNumber: () => value },
                };
            }),
            update: vi.fn(async ({ where, data }: { where: { id: string }; data: { standardCost: number } }) => {
                standardCostMap[where.id] = data.standardCost;
                return { id: where.id, standardCost: data.standardCost };
            }),
        },
        costHistory: {
            create: vi.fn(async () => ({ id: 'history-id' })),
        },
        $transaction: vi.fn(async (input: unknown) => {
            if (typeof input === 'function') {
                return (input as (tx: typeof mockPrisma) => Promise<unknown>)(mockPrisma);
            }
            return input;
        }),
    };

    return {
        prisma: mockPrisma,
    };
});

import { prisma } from '@/lib/core/prisma';
import { BomCostCascadeService } from '../bom-cost-cascade-service';

describe('BomCostCascadeService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('cascades standard cost updates through parent BOM chain', async () => {
        vi.mocked(prisma.productVariant.findUnique)
            .mockResolvedValueOnce({ standardCost: { toNumber: () => 200 } } as never)
            .mockResolvedValueOnce({ standardCost: { toNumber: () => 500 } } as never);

        const result = await BomCostCascadeService.cascadeFromVariants({
            rootVariantIds: ['mix-out'],
            defaultOnly: true,
            referenceId: 'root-bom:test',
            userId: 'user-1',
        });

        expect(result.updatedCount).toBe(2);
        expect(result.updatedVariantIds).toContain('ext-out');
        expect(result.updatedVariantIds).toContain('pack-out');

        expect(prisma.productVariant.update).toHaveBeenNthCalledWith(1, {
            where: { id: 'ext-out' },
            data: { standardCost: 100 },
        });
        expect(prisma.productVariant.update).toHaveBeenNthCalledWith(2, {
            where: { id: 'pack-out' },
            data: { standardCost: 200 },
        });
    });

    it('throws when BOM graph has cycle back to output variant', async () => {
        await expect(
            BomCostCascadeService.validateNoBomCycle({
                outputVariantId: 'mix-root',
                itemVariantIds: ['mix-mid'],
            })
        ).rejects.toThrow(/cyclic/i);
    });
});