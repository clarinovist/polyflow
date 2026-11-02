import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '@/lib/errors/errors';

const mocks = vi.hoisted(() => ({
    permission: vi.fn(),
    checkHealth: vi.fn(),
    pairHistory: vi.fn(),
    tenant: vi.fn(),
}));
vi.mock('@/lib/core/tenant', () => ({
    withTenant:
        (fn: (...args: unknown[]) => unknown) =>
        (...args: unknown[]) => {
            mocks.tenant();
            return fn(...args);
        },
}));
vi.mock('@/lib/tools/auth-checks', () => ({
    requireWarehouseResourcePermission: mocks.permission,
}));
vi.mock('@/services/inventory/stock-ledger-health-service', () => ({
    checkStockLedgerHealth: mocks.checkHealth,
    getStockLedgerPairHistory: mocks.pairHistory,
}));

import {
    getStockLedgerGapHistory,
    listStockLedgerGaps,
} from '../stock-ledger-gaps';

beforeEach(() => vi.resetAllMocks());

describe('stock-ledger-gaps actions', () => {
    it('lists stock ledger gaps in tenant context after checking warehouse permission', async () => {
        const health = {
            mismatches: [],
            roundingCount: 0,
            materialCount: 0,
            findings: 0,
        };
        mocks.checkHealth.mockResolvedValue(health);

        expect(await listStockLedgerGaps()).toEqual({
            success: true,
            data: { ...health, mismatchesTruncated: false },
        });
        expect(mocks.tenant).toHaveBeenCalledOnce();
        expect(mocks.permission).toHaveBeenCalledWith(
            '/warehouse/inventory/ledger-gaps',
        );
        expect(mocks.checkHealth).toHaveBeenCalledOnce();
    });

    it('caps the rendered mismatch list but keeps the full finding count', async () => {
        const mismatches = Array.from({ length: 201 }, (_, index) => ({
            productVariantId: `pv-${index}`,
            locationId: 'loc-1',
            skuCode: `SKU-${index}`,
            locationName: 'Gudang A',
            live: '1',
            ledger: '0.9999',
            diff: '0.0001',
        }));
        mocks.checkHealth.mockResolvedValue({
            mismatches,
            roundingCount: 201,
            materialCount: 0,
            findings: 201,
        });

        const result = await listStockLedgerGaps();
        expect(result.success).toBe(true);
        if (!result.success) return;
        const data = result.data as {
            mismatches: unknown[];
            mismatchesTruncated: boolean;
            findings: number;
        };
        expect(data.mismatches).toHaveLength(200);
        expect(data.mismatchesTruncated).toBe(true);
        expect(data.findings).toBe(201);
    });

    it('denies listStockLedgerGaps when unauthorized before querying health', async () => {
        mocks.permission.mockRejectedValue(
            new AuthorizationError('Tidak diizinkan'),
        );

        expect(await listStockLedgerGaps()).toMatchObject({
            success: false,
            code: 'AUTHORIZATION_ERROR',
        });
        expect(mocks.checkHealth).not.toHaveBeenCalled();
    });

    it('returns pair history for valid variant and location IDs', async () => {
        const history = {
            productVariantId: 'pv-1',
            locationId: 'loc-1',
            live: '10',
            ledger: '8',
            diff: '2',
            openingBalance: '0',
            truncated: false,
            totalMovements: 1,
            firstNegative: null,
            movements: [],
        };
        mocks.pairHistory.mockResolvedValue(history);

        expect(
            await getStockLedgerGapHistory({
                productVariantId: ' pv-1 ',
                locationId: ' loc-1 ',
            }),
        ).toEqual({
            success: true,
            data: history,
        });
        expect(mocks.tenant).toHaveBeenCalledOnce();
        expect(mocks.permission).toHaveBeenCalledWith(
            '/warehouse/inventory/ledger-gaps',
        );
        expect(mocks.pairHistory).toHaveBeenCalledWith('pv-1', 'loc-1');
    });

    it.each([
        { productVariantId: '', locationId: 'loc-1' },
        { productVariantId: 'pv-1', locationId: '   ' },
        {},
    ])(
        'rejects invalid pair history input before querying service: %j',
        async (invalid) => {
            expect(await getStockLedgerGapHistory(invalid)).toMatchObject({
                success: false,
                code: 'VALIDATION_ERROR',
            });
            expect(mocks.pairHistory).not.toHaveBeenCalled();
        },
    );

    it('denies getStockLedgerGapHistory when unauthorized', async () => {
        mocks.permission.mockRejectedValue(
            new AuthorizationError('Tidak diizinkan'),
        );

        expect(
            await getStockLedgerGapHistory({
                productVariantId: 'pv-1',
                locationId: 'loc-1',
            }),
        ).toMatchObject({
            success: false,
            code: 'AUTHORIZATION_ERROR',
        });
        expect(mocks.pairHistory).not.toHaveBeenCalled();
    });
});
