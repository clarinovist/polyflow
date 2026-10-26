import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    findOrder: vi.fn(),
    findOptions: vi.fn(),
    findInventory: vi.fn(),
    findConsumption: vi.fn(),
    resolveActor: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({ withTenant: <T>(fn: T) => fn }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: { findUniqueOrThrow: mocks.findOrder },
        productionPackagingOption: { findMany: mocks.findOptions },
        inventory: { findMany: mocks.findInventory },
        productionPackagingConsumption: { findMany: mocks.findConsumption },
    },
}));
vi.mock('@/lib/auth/kiosk-actor', () => ({ resolveKioskActor: () => mocks.resolveActor() }));

import { getKioskPackagingContext } from '../kiosk-packaging';

const packagingItem = (productVariantId: string, productType: string) => ({
    productVariantId,
    productVariant: { product: { productType } },
});

beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActor.mockResolvedValue({ userId: undefined, operatorId: 'op-1' });
    mocks.findOrder.mockResolvedValue({
        actualPackagingEnabled: true,
        requestedOutputVariantId: null,
        actualQuantity: { toString: () => '80' },
        bom: {
            productVariantId: 'base',
            productVariant: { name: 'Tali Rafia 1 kg' },
            items: [packagingItem('sack', 'PACKAGING'), packagingItem('resin', 'RAW_MATERIAL')],
        },
        plannedMaterials: [],
    });
    mocks.findOptions.mockResolvedValue([
        { outputVariantId: 'brand-a', outputVariant: { name: 'Merek A' }, labelVariantId: 'label-a', labelVariant: { name: 'Etiket A' } },
        { outputVariantId: 'brand-b', outputVariant: { name: 'Merek B' }, labelVariantId: null, labelVariant: null },
    ]);
    mocks.findInventory.mockResolvedValue([
        {
            id: 'inv-1', productVariantId: 'label-a', quantity: { toString: () => '3200' },
            productVariant: { name: 'Etiket A', primaryUnit: 'PCS' },
            location: { id: 'pack', name: 'Gudang Kemasan', packagingOwnerCustomerId: null, packagingOwnerCustomer: null },
        },
    ]);
    mocks.findConsumption.mockResolvedValue([
        { productVariantId: 'label-a', quantity: { toString: () => '250' }, unit: 'PCS', productVariant: { name: 'Etiket A' }, movement: { fromLocationId: 'pack' } },
        { productVariantId: 'label-a', quantity: { toString: () => '540' }, unit: 'PCS', productVariant: { name: 'Etiket A' }, movement: { fromLocationId: 'old' } },
    ]);
});

describe('getKioskPackagingContext', () => {
    it('returns brands, planned packaging, stock without cost, and usage on this SPK', async () => {
        const result = await getKioskPackagingContext('po-1');

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toEqual({
            enabled: true,
            baseVariantId: 'base',
            fixedBrandId: null,
            brands: [
                { id: 'base', name: 'Tali Rafia 1 kg', labelVariantId: null, labelName: null },
                { id: 'brand-a', name: 'Merek A', labelVariantId: 'label-a', labelName: 'Etiket A' },
                { id: 'brand-b', name: 'Merek B', labelVariantId: null, labelName: null },
            ],
            plannedPackagingIds: ['sack'],
            stock: [{
                id: 'inv-1', productVariantId: 'label-a', name: 'Etiket A', unit: 'PCS',
                locationId: 'pack', locationName: 'Gudang Kemasan', ownerCustomerId: null, ownerName: null, quantity: 3200,
            }],
            usage: [{ productVariantId: 'label-a', name: 'Etiket A', unit: 'PCS', quantity: 790, lastSourceLocationId: 'pack' }],
            producedBaseQty: 80,
        });
        expect(JSON.stringify(result.data)).not.toMatch(/cost/i);
        expect(mocks.findConsumption).toHaveBeenCalledWith(expect.objectContaining({
            where: { execution: { productionOrderId: 'po-1', status: { not: 'VOIDED' } } },
        }));
    });

    it('limits brands to the SKU the SPK was made for', async () => {
        mocks.findOrder.mockResolvedValue({
            ...(await mocks.findOrder()),
            requestedOutputVariantId: 'brand-a',
            plannedMaterials: [packagingItem('film', 'PACKAGING')],
        });

        const result = await getKioskPackagingContext('po-1');

        if (!result.success) throw new Error(result.error);
        expect(result.data.fixedBrandId).toBe('brand-a');
        expect(result.data.brands.map((brand) => brand.id)).toEqual(['brand-a']);
        expect(result.data.plannedPackagingIds).toEqual(['film']);
    });

    it('needs a signed-in user or a PIN operator', async () => {
        mocks.resolveActor.mockRejectedValue(Object.assign(new Error('Sesi operator berakhir.'), { name: 'BusinessRuleError' }));

        const result = await getKioskPackagingContext('po-1');

        expect(result.success).toBe(false);
        expect(mocks.findOrder).not.toHaveBeenCalled();
    });

    it('rejects an empty order id', async () => {
        const result = await getKioskPackagingContext('');

        expect(result.success).toBe(false);
        expect(mocks.findOrder).not.toHaveBeenCalled();
    });
});
