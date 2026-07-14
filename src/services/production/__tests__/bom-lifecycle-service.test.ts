import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock prisma
vi.mock('@/lib/core/prisma', () => {
    const mockPrisma = {
        bom: {
            findUnique: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        productionOrder: {
            count: vi.fn(),
        },
        $transaction: vi.fn(),
    };
    return { prisma: mockPrisma };
});

// Mock logger
vi.mock('@/lib/config/logger', () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

import { prisma } from '@/lib/core/prisma';
import { BomLifecycleService } from '../bom-lifecycle-service';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';

const mockPrisma = vi.mocked(prisma);
const ctx = { userId: 'user-1' };

describe('BomLifecycleService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getUsage', () => {
        it('should return production order count', async () => {
            mockPrisma.productionOrder.count.mockResolvedValue(5);
            const result = await BomLifecycleService.getUsage('bom-1');
            expect(result.productionOrderCount).toBe(5);
            expect(mockPrisma.productionOrder.count).toHaveBeenCalledWith({
                where: { bomId: 'bom-1' },
            });
        });

        it('should return 0 when no usage', async () => {
            mockPrisma.productionOrder.count.mockResolvedValue(0);
            const result = await BomLifecycleService.getUsage('bom-1');
            expect(result.productionOrderCount).toBe(0);
        });
    });

    describe('canHardDelete', () => {
        it('should return ok when BOM has no usage', async () => {
            mockPrisma.bom.findUnique.mockResolvedValue({ id: 'bom-1', name: 'Test' });
            mockPrisma.productionOrder.count.mockResolvedValue(0);
            const result = await BomLifecycleService.canHardDelete('bom-1');
            expect(result.ok).toBe(true);
        });

        it('should return not ok when BOM is in use', async () => {
            mockPrisma.bom.findUnique.mockResolvedValue({ id: 'bom-1', name: 'Test' });
            mockPrisma.productionOrder.count.mockResolvedValue(3);
            const result = await BomLifecycleService.canHardDelete('bom-1');
            expect(result.ok).toBe(false);
            expect(result.reason).toBe('BOM_IN_USE');
            expect(result.count).toBe(3);
        });

        it('should return not ok when BOM not found', async () => {
            mockPrisma.bom.findUnique.mockResolvedValue(null);
            const result = await BomLifecycleService.canHardDelete('nonexistent');
            expect(result.ok).toBe(false);
            expect(result.reason).toBe('BOM_NOT_FOUND');
        });
    });

    describe('hardDelete', () => {
        it('should delete BOM with no usage', async () => {
            mockPrisma.bom.findUnique.mockResolvedValue({ id: 'bom-1', name: 'Test' });
            mockPrisma.productionOrder.count.mockResolvedValue(0);
            mockPrisma.bom.delete.mockResolvedValue({});

            await BomLifecycleService.hardDelete('bom-1', ctx);

            expect(mockPrisma.bom.delete).toHaveBeenCalledWith({ where: { id: 'bom-1' } });
        });

        it('should throw BusinessRuleError when BOM is in use', async () => {
            mockPrisma.bom.findUnique.mockResolvedValue({ id: 'bom-1', name: 'Test' });
            mockPrisma.productionOrder.count.mockResolvedValue(2);

            await expect(
                BomLifecycleService.hardDelete('bom-1', ctx)
            ).rejects.toThrow(BusinessRuleError);
        });

        it('should throw NotFoundError when BOM does not exist', async () => {
            mockPrisma.bom.findUnique.mockResolvedValue(null);

            await expect(
                BomLifecycleService.hardDelete('nonexistent', ctx)
            ).rejects.toThrow(NotFoundError);
        });

        it('should handle race condition (FK constraint after pre-check)', async () => {
            mockPrisma.bom.findUnique.mockResolvedValue({ id: 'bom-1', name: 'Test' });
            mockPrisma.productionOrder.count.mockResolvedValue(0);
            mockPrisma.bom.delete.mockRejectedValue(
                new Error('update or delete on table "Bom" violates foreign key constraint')
            );

            await expect(
                BomLifecycleService.hardDelete('bom-1', ctx)
            ).rejects.toThrow(BusinessRuleError);
        });
    });

    describe('archive', () => {
        it('should archive non-default BOM', async () => {
            mockPrisma.bom.findUnique.mockResolvedValue({
                id: 'bom-1',
                name: 'Test',
                isActive: true,
                isDefault: false,
                productVariantId: 'pv-1',
            });
            mockPrisma.bom.update.mockResolvedValue({});

            await BomLifecycleService.archive('bom-1', ctx);

            expect(mockPrisma.bom.update).toHaveBeenCalledWith({
                where: { id: 'bom-1' },
                data: {
                    isActive: false,
                    archivedAt: expect.any(Date),
                    archivedById: 'user-1',
                },
            });
        });

        it('should throw when BOM already archived', async () => {
            mockPrisma.bom.findUnique.mockResolvedValue({
                id: 'bom-1',
                name: 'Test',
                isActive: false,
                isDefault: false,
            });

            await expect(
                BomLifecycleService.archive('bom-1', ctx)
            ).rejects.toThrow(BusinessRuleError);
        });

        it('should throw when archiving default without replacement', async () => {
            mockPrisma.bom.findUnique.mockResolvedValue({
                id: 'bom-1',
                name: 'Test',
                isActive: true,
                isDefault: true,
                productVariantId: 'pv-1',
            });

            await expect(
                BomLifecycleService.archive('bom-1', ctx)
            ).rejects.toThrow(BusinessRuleError);
        });

        it('should archive default with valid replacement atomically', async () => {
            mockPrisma.bom.findUnique
                .mockResolvedValueOnce({
                    id: 'bom-1',
                    name: 'Old Default',
                    isActive: true,
                    isDefault: true,
                    productVariantId: 'pv-1',
                })
                .mockResolvedValueOnce({
                    id: 'bom-2',
                    name: 'New Default',
                    isActive: true,
                    isDefault: false,
                    productVariantId: 'pv-1',
                });

            mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
                return fn(mockPrisma);
            });
            mockPrisma.bom.update.mockResolvedValue({});

            await BomLifecycleService.archive('bom-1', ctx, 'bom-2');

            expect(mockPrisma.$transaction).toHaveBeenCalled();
            expect(mockPrisma.bom.update).toHaveBeenCalledTimes(2);
        });

        it('should reject replacement from different variant', async () => {
            mockPrisma.bom.findUnique
                .mockResolvedValueOnce({
                    id: 'bom-1',
                    name: 'Test',
                    isActive: true,
                    isDefault: true,
                    productVariantId: 'pv-1',
                })
                .mockResolvedValueOnce({
                    id: 'bom-2',
                    name: 'Wrong Variant',
                    isActive: true,
                    isDefault: false,
                    productVariantId: 'pv-999',
                });

            await expect(
                BomLifecycleService.archive('bom-1', ctx, 'bom-2')
            ).rejects.toThrow(BusinessRuleError);
        });

        it('should reject inactive replacement', async () => {
            mockPrisma.bom.findUnique
                .mockResolvedValueOnce({
                    id: 'bom-1',
                    name: 'Test',
                    isActive: true,
                    isDefault: true,
                    productVariantId: 'pv-1',
                })
                .mockResolvedValueOnce({
                    id: 'bom-2',
                    name: 'Inactive',
                    isActive: false,
                    isDefault: false,
                    productVariantId: 'pv-1',
                });

            await expect(
                BomLifecycleService.archive('bom-1', ctx, 'bom-2')
            ).rejects.toThrow(BusinessRuleError);
        });

        it('should throw when BOM not found', async () => {
            mockPrisma.bom.findUnique.mockResolvedValue(null);

            await expect(
                BomLifecycleService.archive('nonexistent', ctx)
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe('reactivate', () => {
        it('should reactivate an archived BOM', async () => {
            mockPrisma.bom.findUnique.mockResolvedValue({
                id: 'bom-1',
                name: 'Test',
                isActive: false,
            });
            mockPrisma.bom.update.mockResolvedValue({});

            await BomLifecycleService.reactivate('bom-1', ctx);

            expect(mockPrisma.bom.update).toHaveBeenCalledWith({
                where: { id: 'bom-1' },
                data: {
                    isActive: true,
                    archivedAt: null,
                    archivedById: null,
                },
            });
        });

        it('should throw when BOM is already active', async () => {
            mockPrisma.bom.findUnique.mockResolvedValue({
                id: 'bom-1',
                name: 'Test',
                isActive: true,
            });

            await expect(
                BomLifecycleService.reactivate('bom-1', ctx)
            ).rejects.toThrow(BusinessRuleError);
        });

        it('should throw when BOM not found', async () => {
            mockPrisma.bom.findUnique.mockResolvedValue(null);

            await expect(
                BomLifecycleService.reactivate('nonexistent', ctx)
            ).rejects.toThrow(NotFoundError);
        });
    });
});
