import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
const mock = vi.hoisted(() => ({
    planning: vi.fn(), production: vi.fn(),
    variant: vi.fn(), option: vi.fn(), customer: vi.fn(), location: vi.fn(), createLocation: vi.fn(), audit: vi.fn(),
}));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/tools/auth-checks', () => ({ requirePlanningRole: mock.planning, requireProductionLeaderRole: mock.production }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mock.audit }));
vi.mock('@/lib/core/prisma', () => {
    const db = { productVariant: { findUniqueOrThrow: mock.variant }, productionPackagingOption: { create: mock.option }, customer: { findUniqueOrThrow: mock.customer }, location: { findUnique: mock.location, create: mock.createLocation } };
    return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});
import { createPackagingCustodyLocation, createProductionPackagingOption } from '../packaging';
const variant = { productId: 'product', primaryUnit: 'KG', salesUnit: null, conversionFactor: new Prisma.Decimal(1), archivedAt: null };
describe('packaging configuration authorization and mapping', () => {
    beforeEach(() => {
        vi.resetAllMocks(); mock.planning.mockResolvedValue({ user: { id: 'planner' } });
        mock.variant.mockResolvedValue(variant); mock.option.mockResolvedValue({ id: 'option' });
        mock.customer.mockResolvedValue({ id: 'customer', name: 'Synthetic' }); mock.location.mockResolvedValue(null); mock.createLocation.mockResolvedValue({ id: 'new-location' });
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
