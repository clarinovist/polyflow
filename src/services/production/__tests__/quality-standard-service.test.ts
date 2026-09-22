import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', () => {
    const mockPrisma = {
        qualityCheckParameter: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    };
    return { prisma: { ...mockPrisma, $transaction: vi.fn((fn) => fn({ ...mockPrisma, $queryRaw: vi.fn() })) } };
});

import { prisma } from '@/lib/core/prisma';
import { QualityStandardService } from '../quality-standard-service';
import { NotFoundError } from '@/lib/errors/errors';

describe('QualityStandardService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('listByVariant sorts parameters by sortOrder then createdAt', async () => {
        (prisma.qualityCheckParameter.findMany as any).mockResolvedValue([]);

        await QualityStandardService.listByVariant('variant-1');

        expect(prisma.qualityCheckParameter.findMany).toHaveBeenCalledWith({
            where: { productVariantId: 'variant-1' },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
    });

    it('filters display-only standards out of kiosk reads', async () => {
        await QualityStandardService.listByVariant('variant-1', true);
        expect(prisma.qualityCheckParameter.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { productVariantId: 'variant-1', requireMeasurement: true },
        }));
    });

    it.each([
        { minValue: 12, maxValue: 11 },
        { minValue: 11, targetValue: 10 },
        { maxValue: 12, targetValue: 13 },
        { minValue: Infinity },
    ])('rejects invalid range %j', async (range) => {
        await expect(QualityStandardService.create({ productVariantId: 'v', name: 'Weight', unit: 'g/m', sortOrder: 0, ...range })).rejects.toThrow('Rentang');
        expect(prisma.qualityCheckParameter.create).not.toHaveBeenCalled();
    });

    it('validates partial updates against the existing bounds and permits explicit clearing', async () => {
        vi.mocked(prisma.qualityCheckParameter.findUnique).mockResolvedValue({ id: 'p', minValue: 11, maxValue: 12, targetValue: null } as never);
        await expect(QualityStandardService.update({ id: 'p', minValue: 13 })).rejects.toThrow('Rentang');
        expect(prisma.qualityCheckParameter.update).not.toHaveBeenCalled();
        await QualityStandardService.update({ id: 'p', minValue: 13, maxValue: null });
        expect(prisma.qualityCheckParameter.update).toHaveBeenCalledWith({ where: { id: 'p' }, data: { minValue: 13, maxValue: null } });
    });

    it('create passes data straight through to prisma', async () => {
        const data = {
            productVariantId: 'variant-1',
            name: 'Panjang',
            unit: 'cm',
            sortOrder: 0,
        };
        (prisma.qualityCheckParameter.create as any).mockResolvedValue({
            id: 'param-1',
            ...data,
        });

        const result = await QualityStandardService.create(data as any);

        expect(prisma.qualityCheckParameter.create).toHaveBeenCalledWith({
            data,
        });
        expect(result.id).toBe('param-1');
    });

    it('update throws NotFoundError when the parameter does not exist', async () => {
        (prisma.qualityCheckParameter.findUnique as any).mockResolvedValue(
            null,
        );

        await expect(
            QualityStandardService.update({ id: 'missing', name: 'X' } as any),
        ).rejects.toThrow(NotFoundError);
        expect(prisma.qualityCheckParameter.update).not.toHaveBeenCalled();
    });

    it('update applies partial changes when the parameter exists', async () => {
        (prisma.qualityCheckParameter.findUnique as any).mockResolvedValue({
            id: 'param-1',
        });
        (prisma.qualityCheckParameter.update as any).mockResolvedValue({
            id: 'param-1',
            name: 'Panjang Baru',
        });

        const result = await QualityStandardService.update({
            id: 'param-1',
            name: 'Panjang Baru',
        } as any);

        expect(prisma.qualityCheckParameter.update).toHaveBeenCalledWith({
            where: { id: 'param-1' },
            data: { name: 'Panjang Baru' },
        });
        expect(result.name).toBe('Panjang Baru');
    });

    it('delete throws NotFoundError when the parameter does not exist', async () => {
        (prisma.qualityCheckParameter.findUnique as any).mockResolvedValue(
            null,
        );

        await expect(
            QualityStandardService.delete('missing'),
        ).rejects.toThrow(NotFoundError);
        expect(prisma.qualityCheckParameter.delete).not.toHaveBeenCalled();
    });

    it('delete removes the parameter when it exists', async () => {
        (prisma.qualityCheckParameter.findUnique as any).mockResolvedValue({
            id: 'param-1',
        });

        await QualityStandardService.delete('param-1');

        expect(prisma.qualityCheckParameter.delete).toHaveBeenCalledWith({
            where: { id: 'param-1' },
        });
    });
});
