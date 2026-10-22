import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
const mock = vi.hoisted(() => ({
    planning: vi.fn(), production: vi.fn(),
    variant: vi.fn(), option: vi.fn(), options: vi.fn(), stock: vi.fn(), customer: vi.fn(), location: vi.fn(), createLocation: vi.fn(), audit: vi.fn(),
}));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/tools/auth-checks', () => ({ requirePlanningRole: mock.planning, requireProductionLeaderRole: mock.production }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mock.audit }));
vi.mock('@/lib/core/prisma', () => {
    const db = { productVariant: { findUniqueOrThrow: mock.variant }, productionPackagingOption: { create: mock.option, findMany: mock.options }, inventory: { findMany: mock.stock }, customer: { findUniqueOrThrow: mock.customer }, location: { findUnique: mock.location, create: mock.createLocation } };
    return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});
import { createPackagingCustodyLocation, createProductionPackagingOption, getProductionPackagingOptions } from '../packaging';
const variant = { productId: 'product', primaryUnit: 'KG', salesUnit: null, conversionFactor: new Prisma.Decimal(1), archivedAt: null };
describe('packaging configuration authorization and mapping', () => {
    beforeEach(() => {
        vi.resetAllMocks(); mock.planning.mockResolvedValue({ user: { id: 'planner' } });
        mock.variant.mockResolvedValue(variant); mock.option.mockResolvedValue({ id: 'option' });
        mock.options.mockResolvedValue([]); mock.stock.mockResolvedValue([]);
        mock.customer.mockResolvedValue({ id: 'customer', name: 'Synthetic' }); mock.location.mockResolvedValue(null); mock.createLocation.mockResolvedValue({ id: 'new-location' });
    });
    it('queries existing AUXILIARY and PACKAGING stock in KG/PCS with ownership guards and returns units', async () => {
        mock.stock.mockResolvedValue([{ id: 'stock', productVariantId: 'film', locationId: 'own', quantity: new Prisma.Decimal(2.5),
            productVariant: { name: 'Synthetic film', primaryUnit: 'KG' },
            location: { name: 'Synthetic warehouse', packagingOwnerCustomerId: null, packagingOwnerCustomer: null },
        }]);
        const result = await getProductionPackagingOptions('base');
        expect(result).toMatchObject({ success: true, data: { stock: [{ unit: 'KG', quantity: 2.5, ownerCustomerId: null }] } });
        expect(mock.production).toHaveBeenCalledOnce();
        expect(mock.stock).toHaveBeenCalledWith(expect.objectContaining({ where: {
            quantity: { gt: 0 }, productVariant: { archivedAt: null, primaryUnit: { in: ['KG', 'PCS'] }, product: { productType: { in: ['PACKAGING', 'AUXILIARY'] } } },
            OR: [{ location: { locationType: 'INTERNAL' } }, { location: { packagingOwnerCustomerId: { not: null } } }],
        } }));
    });
    it('returns an empty stock list honestly and does not query stock without authorization', async () => {
        expect(await getProductionPackagingOptions('base')).toMatchObject({ success: true, data: { stock: [] } });
        mock.stock.mockClear(); mock.production.mockRejectedValueOnce(new Error('denied'));
        expect((await getProductionPackagingOptions('base')).success).toBe(false);
        expect(mock.stock).not.toHaveBeenCalled();
    });
    it('maps existing AUXILIARY PCS labels but rejects KG as a label', async () => {
        const label = { ...variant, primaryUnit: 'PCS', product: { productType: 'AUXILIARY' } };
        mock.variant.mockResolvedValueOnce(variant).mockResolvedValueOnce(variant).mockResolvedValueOnce(label);
        expect((await createProductionPackagingOption({ baseVariantId: 'base', outputVariantId: 'brand', labelVariantId: 'label' })).success).toBe(true);
        mock.variant.mockResolvedValueOnce(variant).mockResolvedValueOnce(variant).mockResolvedValueOnce({ ...label, primaryUnit: 'KG' });
        expect((await createProductionPackagingOption({ baseVariantId: 'base', outputVariantId: 'brand', labelVariantId: 'label' })).success).toBe(false);
    });
    it('creates matching SKU mapping and audits it', async () => {
        const result = await createProductionPackagingOption({ baseVariantId: 'base', outputVariantId: 'brand', labelVariantId: null });
        expect(result.success).toBe(true); expect(mock.audit).toHaveBeenCalledOnce();
    });
    it('rejects incompatible SKU and unauthorized writes', async () => {
        mock.variant.mockResolvedValueOnce(variant).mockResolvedValueOnce({ ...variant, primaryUnit: 'PCS' });
        expect((await createProductionPackagingOption({ baseVariantId: 'base', outputVariantId: 'brand', labelVariantId: null })).success).toBe(false);
        mock.planning.mockRejectedValueOnce(new Error('denied'));
        expect((await createPackagingCustodyLocation({ customerId: 'customer' })).success).toBe(false);
        expect(mock.createLocation).not.toHaveBeenCalled();
    });
    it('creates an empty owned location without assigning historical balances', async () => {
        expect((await createPackagingCustodyLocation({ customerId: 'customer' })).success).toBe(true);
        expect(mock.createLocation).toHaveBeenCalledWith({ data: expect.objectContaining({ packagingOwnerCustomerId: 'customer', locationType: 'CUSTOMER_OWNED' }) });
    });
    it('returns existing matching location and rejects a conflicting owner', async () => {
        mock.location.mockResolvedValue({ id: 'existing', packagingOwnerCustomerId: 'customer' });
        expect((await createPackagingCustodyLocation({ customerId: 'customer' })).success).toBe(true);
        mock.location.mockResolvedValue({ id: 'existing', packagingOwnerCustomerId: 'other' });
        expect((await createPackagingCustodyLocation({ customerId: 'customer' })).success).toBe(false);
        expect(mock.createLocation).not.toHaveBeenCalled();
    });
});
