import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError, ValidationError } from '@/lib/errors/errors';

const mocks = vi.hoisted(() => ({ permission: vi.fn(), service: vi.fn(), tenant: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
        mocks.tenant();
        return fn(...args);
    },
}));
vi.mock('@/lib/tools/auth-checks', () => ({ requireWarehouseResourcePermission: mocks.permission }));
vi.mock('@/services/inventory/stock-balance-service', () => ({ getStockBalance: mocks.service }));

import { getStockBalanceAction } from '../stock-balance';

beforeEach(() => vi.resetAllMocks());

describe('getStockBalanceAction', () => {
    it('runs in tenant context, checks inventory access and passes filters', async () => {
        const filters = { startDate: '2026-09-01', endDate: '2026-09-09', locationId: 'L1' };
        mocks.service.mockResolvedValue({ rows: [] });
        expect(await getStockBalanceAction(filters)).toEqual({ success: true, data: { rows: [] } });
        expect(mocks.tenant).toHaveBeenCalledOnce();
        expect(mocks.permission).toHaveBeenCalledWith('/warehouse/inventory');
        expect(mocks.service).toHaveBeenCalledWith(filters);
    });

    it('allows defaults', async () => {
        await getStockBalanceAction();
        expect(mocks.service).toHaveBeenCalledWith({});
    });

    it('denies before any report read', async () => {
        mocks.permission.mockRejectedValue(new AuthorizationError('Tidak diizinkan'));
        expect(await getStockBalanceAction()).toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        expect(mocks.service).not.toHaveBeenCalled();
    });

    it('returns domain errors rather than empty reports', async () => {
        mocks.service.mockRejectedValue(new ValidationError('Tanggal tidak valid'));
        expect(await getStockBalanceAction()).toMatchObject({ success: false, error: 'Tanggal tidak valid' });
    });

    it('preserves login redirects', async () => {
        mocks.permission.mockRejectedValue(new Error('NEXT_REDIRECT'));
        await expect(getStockBalanceAction()).rejects.toThrow('NEXT_REDIRECT');
        expect(mocks.service).not.toHaveBeenCalled();
    });
});
