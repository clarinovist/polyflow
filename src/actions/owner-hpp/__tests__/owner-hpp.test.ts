import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    guard: vi.fn(),
    readWorkspace: vi.fn(),
    writeWorkspace: vi.fn(),
    readNodes: vi.fn(),
    readOptions: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/auth/owner-hpp-access', () => ({
    requireOwnerHppAccess: mocks.guard,
}));
vi.mock('../owner-hpp-query', () => ({
    readOwnerHppWorkspace: mocks.readWorkspace,
    writeOwnerHppWorkspace: mocks.writeWorkspace,
    readOwnerHppErpNodes: mocks.readNodes,
}));
vi.mock('@/actions/production/hpp-price-simulator-query', () => ({
    readHppPriceSimulatorVariantOptions: mocks.readOptions,
}));

import { AuthorizationError } from '@/lib/errors/errors';
import { chainScenario } from '@/lib/owner-hpp/__tests__/fixtures';
import {
    getOwnerHppErpChain,
    getOwnerHppWorkspace,
    listOwnerHppVariantOptions,
    saveOwnerHppWorkspace,
} from '../owner-hpp';

const db = { marker: 'db' };

describe('owner HPP server actions', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.guard.mockResolvedValue({ db, userId: 'u1' });
    });

    it.each([
        ['getOwnerHppWorkspace', () => getOwnerHppWorkspace()],
        ['saveOwnerHppWorkspace', () => saveOwnerHppWorkspace({})],
        ['listOwnerHppVariantOptions', () => listOwnerHppVariantOptions()],
        ['getOwnerHppErpChain', () => getOwnerHppErpChain('v1')],
    ])('%s is denied without touching data when the guard rejects', async (_name, call) => {
        mocks.guard.mockRejectedValue(new AuthorizationError('no'));

        const result = await call();

        expect(result).toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        expect(mocks.readWorkspace).not.toHaveBeenCalled();
        expect(mocks.writeWorkspace).not.toHaveBeenCalled();
        expect(mocks.readNodes).not.toHaveBeenCalled();
        expect(mocks.readOptions).not.toHaveBeenCalled();
    });

    it('loads the workspace of the authenticated user only', async () => {
        mocks.readWorkspace.mockResolvedValue({ marker: 'ws' });

        const result = await getOwnerHppWorkspace();

        expect(result).toEqual({ success: true, data: { marker: 'ws' } });
        expect(mocks.readWorkspace).toHaveBeenCalledWith(db, 'u1');
    });

    it('rejects an invalid document before writing', async () => {
        const result = await saveOwnerHppWorkspace({ version: 2, scenarios: [] });

        expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(mocks.writeWorkspace).not.toHaveBeenCalled();
    });

    it('saves a valid document under the authenticated user', async () => {
        const workspace = { version: 2, scenarios: [chainScenario()] };
        mocks.writeWorkspace.mockResolvedValue({ updatedAt: 'now' });

        const result = await saveOwnerHppWorkspace(workspace);

        expect(result).toEqual({ success: true, data: { updatedAt: 'now' } });
        expect(mocks.writeWorkspace).toHaveBeenCalledWith(db, 'u1', workspace);
    });

    it('lists product options through the existing read-only query', async () => {
        mocks.readOptions.mockResolvedValue([{ id: 'v1' }]);

        const result = await listOwnerHppVariantOptions();

        expect(result).toEqual({ success: true, data: [{ id: 'v1' }] });
        expect(mocks.readOptions).toHaveBeenCalledWith(db);
    });

    it('rejects a malformed product id before querying', async () => {
        const result = await getOwnerHppErpChain("v1'; drop table x;--");

        expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(mocks.readNodes).not.toHaveBeenCalled();
    });

    it('builds stages from the ERP tree for a product', async () => {
        mocks.readNodes.mockResolvedValue(
            new Map([
                [
                    'v1',
                    {
                        variantId: 'v1',
                        variantName: 'Roll',
                        outputUnit: 'KG',
                        bomName: 'BOM',
                        outputQuantity: 1,
                        materials: [
                            {
                                variantId: 'r',
                                name: 'Resin',
                                unit: 'KG',
                                quantity: 1,
                                scrapPercent: 0,
                                unitCost: 1000,
                            },
                        ],
                    },
                ],
            ]),
        );

        const result = await getOwnerHppErpChain('v1');

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.stages).toHaveLength(1);
            expect(result.data.finalStageId).toBe(result.data.stages[0].id);
        }
        expect(mocks.readNodes).toHaveBeenCalledWith(db, 'v1');
    });
});
