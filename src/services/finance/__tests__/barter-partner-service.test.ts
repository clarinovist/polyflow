import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tx, prisma } = vi.hoisted(() => {
    const tx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        customer: { findUnique: vi.fn() },
        supplier: { findUnique: vi.fn(), findMany: vi.fn() },
        barterPartner: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
    };
    return {
        tx,
        prisma: {
            ...tx,
            $transaction: vi.fn(
                async (fn: (client: typeof tx) => unknown) => fn(tx),
            ),
        },
    };
});

vi.mock('@/lib/core/prisma', () => ({ prisma }));

import { BarterPartnerService } from '../barter-partner-service';

const customer = {
    id: '11111111-1111-4111-8111-111111111111',
    name: '  PT   SAMA ',
    isActive: true,
    lifecycleStatus: 'ACTIVE',
};
const supplier = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'pt sama',
    code: 'SUP-1',
    isActive: true,
};

describe('BarterPartnerService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tx.customer.findUnique.mockResolvedValue(customer);
        tx.supplier.findUnique.mockResolvedValue(supplier);
        tx.barterPartner.findUnique.mockResolvedValue(null);
        tx.barterPartner.create.mockResolvedValue({
            id: 'partner-1',
            customerId: customer.id,
            supplierId: supplier.id,
            isActive: true,
            supplier,
        });
    });

    it('creates an explicitly confirmed same-name pair', async () => {
        const result = await BarterPartnerService.save(
            {
                customerId: customer.id,
                supplierId: supplier.id,
                isActive: true,
            },
            'admin-1',
        );

        expect(result).toMatchObject({ id: 'partner-1', isActive: true });
        expect(tx.barterPartner.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                customerId: customer.id,
                supplierId: supplier.id,
                createdById: 'admin-1',
                updatedById: 'admin-1',
            }),
            include: { supplier: true },
        });
    });

    it('rejects nonmatching names and inactive partners', async () => {
        tx.supplier.findUnique.mockResolvedValueOnce({
            ...supplier,
            name: 'PT BERBEDA',
        });
        await expect(
            BarterPartnerService.save(
                {
                    customerId: customer.id,
                    supplierId: supplier.id,
                    isActive: true,
                },
                'admin-1',
            ),
        ).rejects.toMatchObject({ code: 'BARTER_PARTNER_NAME_MISMATCH' });

        tx.supplier.findUnique.mockResolvedValueOnce({
            ...supplier,
            isActive: false,
        });
        await expect(
            BarterPartnerService.save(
                {
                    customerId: customer.id,
                    supplierId: supplier.id,
                    isActive: true,
                },
                'admin-1',
            ),
        ).rejects.toMatchObject({ code: 'BARTER_SUPPLIER_INACTIVE' });
    });

    it('locks identity after a settlement exists while allowing deactivation', async () => {
        tx.barterPartner.findUnique
            .mockResolvedValueOnce({
                id: 'partner-1',
                supplierId: 'old-supplier',
                _count: { settlements: 1 },
            })
            .mockResolvedValueOnce(null);
        await expect(
            BarterPartnerService.save(
                {
                    customerId: customer.id,
                    supplierId: supplier.id,
                    isActive: true,
                },
                'admin-1',
            ),
        ).rejects.toMatchObject({ code: 'BARTER_PARTNER_IMMUTABLE' });

        tx.barterPartner.findUnique
            .mockResolvedValueOnce({
                id: 'partner-1',
                supplierId: supplier.id,
                _count: { settlements: 1 },
            })
            .mockResolvedValueOnce({ id: 'partner-1' });
        tx.barterPartner.update.mockResolvedValueOnce({
            id: 'partner-1',
            isActive: false,
        });
        await expect(
            BarterPartnerService.save(
                {
                    customerId: customer.id,
                    supplierId: supplier.id,
                    isActive: false,
                },
                'admin-1',
            ),
        ).resolves.toMatchObject({ isActive: false });
    });

    it('returns only active exact normalized supplier candidates', async () => {
        prisma.customer.findUnique.mockResolvedValue(customer);
        prisma.supplier.findMany.mockResolvedValue([
            supplier,
            { ...supplier, id: 'supplier-2', name: 'PT Sama Abadi' },
        ]);
        await expect(
            BarterPartnerService.listMatchingSuppliers(customer.id),
        ).resolves.toEqual([supplier]);
    });
});
