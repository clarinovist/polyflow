import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getQualityCheckParametersForVariant,
    getQualityStandardsForVariant,
    createQualityCheckParameter,
    updateQualityCheckParameter,
    deleteQualityCheckParameter,
} from '../production-quality-standards';
import { QualityStandardService } from '@/services/production/quality-standard-service';
import { requireAuth, requireProductionLeaderRole } from '@/lib/tools/auth-checks';
import { revalidatePath } from 'next/cache';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
    requireProductionLeaderRole: vi.fn(),
}));

vi.mock('@/services/production/quality-standard-service', () => ({
    QualityStandardService: {
        listByVariant: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const SESSION = { user: { id: 'user-1' } };

describe('production quality standard actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockResolvedValue(SESSION as never);
        vi.mocked(requireProductionLeaderRole).mockResolvedValue(SESSION as never);
    });

    describe('getQualityCheckParametersForVariant', () => {
        it('returns the parameter list without requiring auth (kiosk read)', async () => {
            vi.mocked(QualityStandardService.listByVariant).mockResolvedValue(
                [{ id: 'param-1' }] as never,
            );

            const res = await getQualityCheckParametersForVariant('variant-1');

            expect(res.success).toBe(true);
            expect(requireAuth).not.toHaveBeenCalled();
            expect(QualityStandardService.listByVariant).toHaveBeenCalledWith('variant-1', true);
            if (res.success) expect(res.data).toHaveLength(1);
        });

        it('reports failure without throwing when the service errors', async () => {
            vi.mocked(QualityStandardService.listByVariant).mockRejectedValue(
                new Error('db down'),
            );

            const res = await getQualityCheckParametersForVariant('variant-1');

            expect(res.success).toBe(false);
        });
    });

    it('reads all standards for authenticated product settings', async () => {
        vi.mocked(QualityStandardService.listByVariant).mockResolvedValue([]);
        expect((await getQualityStandardsForVariant('variant-1')).success).toBe(true);
        expect(requireAuth).toHaveBeenCalled();
        expect(QualityStandardService.listByVariant).toHaveBeenCalledWith('variant-1');
    });

    it('rejects unauthorized mutation without changing a standard', async () => {
        vi.mocked(requireProductionLeaderRole).mockRejectedValueOnce(new Error('Forbidden'));
        expect((await deleteQualityCheckParameter('param-1')).success).toBe(false);
        expect(QualityStandardService.delete).not.toHaveBeenCalled();
    });

    describe('createQualityCheckParameter', () => {
        const input = {
            productVariantId: 'variant-1',
            name: 'Panjang Sedotan',
            unit: 'cm',
            sortOrder: 0,
        };

        it('creates the parameter and revalidates the products page', async () => {
            vi.mocked(QualityStandardService.create).mockResolvedValue({
                id: 'param-1',
                ...input,
            } as never);

            const res = await createQualityCheckParameter(input as never);

            expect(res.success).toBe(true);
            expect(QualityStandardService.create).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Panjang Sedotan' }),
            );
            expect(revalidatePath).toHaveBeenCalledWith(
                '/dashboard/products',
            );
        });

        it('rejects a payload the schema refuses without calling the service', async () => {
            const res = await createQualityCheckParameter({
                productVariantId: '',
                name: '',
                unit: '',
            } as never);

            expect(res.success).toBe(false);
            expect(QualityStandardService.create).not.toHaveBeenCalled();
        });

        it('passes a service error message through', async () => {
            vi.mocked(QualityStandardService.create).mockRejectedValue(
                new Error('Varian tidak ditemukan'),
            );

            const res = await createQualityCheckParameter(input as never);

            expect(res.success).toBe(false);
            if (!res.success)
                expect(res.error).toBe('Varian tidak ditemukan');
        });
    });

    describe('updateQualityCheckParameter', () => {
        it('updates the parameter', async () => {
            vi.mocked(QualityStandardService.update).mockResolvedValue({
                id: 'param-1',
                name: 'Panjang Baru',
            } as never);

            const res = await updateQualityCheckParameter({
                id: 'param-1',
                name: 'Panjang Baru',
            } as never);

            expect(res.success).toBe(true);
            expect(QualityStandardService.update).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'param-1' }),
            );
        });

        it('rejects a payload missing the required id', async () => {
            const res = await updateQualityCheckParameter({} as never);

            expect(res.success).toBe(false);
            expect(QualityStandardService.update).not.toHaveBeenCalled();
        });
    });

    describe('deleteQualityCheckParameter', () => {
        it('deletes the parameter', async () => {
            vi.mocked(QualityStandardService.delete).mockResolvedValue(
                undefined as never,
            );

            const res = await deleteQualityCheckParameter('param-1');

            expect(res.success).toBe(true);
            expect(QualityStandardService.delete).toHaveBeenCalledWith(
                'param-1',
            );
        });

        it('reports failure when the parameter does not exist', async () => {
            vi.mocked(QualityStandardService.delete).mockRejectedValue(
                new Error('Parameter QC tidak ditemukan'),
            );

            const res = await deleteQualityCheckParameter('missing');

            expect(res.success).toBe(false);
        });
    });
});
