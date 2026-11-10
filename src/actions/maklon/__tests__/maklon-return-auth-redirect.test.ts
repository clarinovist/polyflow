import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createMaklonReturnAction,
    getMaklonReturnByIdAction,
    getMaklonReturnsAction,
} from '../maklon-return';
import { requireAuth } from '@/lib/tools/auth-checks';
import { MaklonReturnService } from '@/services/maklon/maklon-return-service';

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/services/maklon/maklon-return-service', () => ({
    MaklonReturnService: {
        createReturn: vi.fn(),
        getReturns: vi.fn(),
        getReturnById: vi.fn(),
    },
}));

const GENERIC_ERROR = 'Gagal memproses retur Maklon';

const redirectError = () =>
    Object.assign(new Error('NEXT_REDIRECT'), {
        digest: 'NEXT_REDIRECT;replace;/login;307;',
    });

const createInput = {
    returnNumber: 'RT-1',
    customerId: 'cust-1',
    sourceLocationId: 'loc-1',
    items: [{ productVariantId: 'pv-1', quantity: 1 }],
};

describe('maklon return actions — sesi habis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockRejectedValue(redirectError());
    });

    it('createMaklonReturnAction melempar ulang redirect', async () => {
        await expect(createMaklonReturnAction(createInput)).rejects.toThrow(
            'NEXT_REDIRECT',
        );
    });

    it('getMaklonReturnsAction melempar ulang redirect', async () => {
        await expect(getMaklonReturnsAction()).rejects.toThrow('NEXT_REDIRECT');
    });

    it('getMaklonReturnByIdAction melempar ulang redirect', async () => {
        await expect(getMaklonReturnByIdAction('ret-1')).rejects.toThrow(
            'NEXT_REDIRECT',
        );
    });

    it('error biasa tetap dikembalikan sebagai gagal', async () => {
        vi.mocked(requireAuth).mockRejectedValue(new Error('boom'));
        const res = await getMaklonReturnsAction();
        expect(res).toEqual({ success: false, error: GENERIC_ERROR });
        expect(MaklonReturnService.getReturns).not.toHaveBeenCalled();
    });
});
