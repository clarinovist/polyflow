import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ProductionOrderService } from '../order-service';

vi.mock('@/lib/core/prisma', () => ({ prisma: {} }));
const fg = {
    id: 'fg',
    name: 'Finished goods',
    slug: 'fg_warehouse',
    locationPurpose: 'FINISHED_GOOD',
    locationType: 'INTERNAL',
};
const supplies = {
    id: 'supplies',
    name: 'Packaging supplies',
    slug: 'gudang-packaging',
    locationPurpose: 'PACKING',
    locationType: 'INTERNAL',
};
const items = [
    { productVariantId: 'goods', quantity: 10, sourceLocationId: fg.id },
    { productVariantId: 'wrap', quantity: 2, sourceLocationId: supplies.id },
];
const input = {
    orderNumber: 'WO-DIRECT-TEST',
    bomId: 'bom',
    locationId: 'fg',
    plannedQuantity: 10,
    plannedStartDate: new Date('2026-09-07T01:00:00Z'),
    notes: '',
    materialConsumptionMode: 'DIRECT' as const,
    items,
    isMaklon: false,
    estimatedConversionCost: 0,
};
const makeTx = () => ({
    bom: {
        findUnique: vi
            .fn()
            .mockResolvedValue({
                id: 'bom',
                isActive: true,
                category: 'PACKING',
            }),
    },
    location: {
        findUnique: vi.fn().mockResolvedValue(fg),
        findMany: vi.fn().mockResolvedValue([fg, supplies]),
    },
    productVariant: {
        findMany: vi
            .fn()
            .mockResolvedValue(
                items.map((item) => ({ id: item.productVariantId })),
            ),
    },
    inventory: {
        findMany: vi
            .fn()
            .mockResolvedValue(
                items.map((item) => ({
                    productVariantId: item.productVariantId,
                    locationId: item.sourceLocationId,
                    quantity: new Prisma.Decimal(100),
                })),
            ),
    },
    productionOrder: {
        create: vi
            .fn()
            .mockImplementation(({ data }: { data: object }) => ({
                id: 'po',
                ...data,
            })),
    },
    productionMaterial: { createMany: vi.fn() },
});
let tx: ReturnType<typeof makeTx>;
beforeEach(() => {
    tx = makeTx();
});
const client = () => tx as unknown as Prisma.TransactionClient;

describe('create direct material order', () => {
    it('persists mode and exact per-material source locations', async () => {
        await ProductionOrderService.createOrder(input, client());
        expect(tx.productionOrder.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                materialConsumptionMode: 'DIRECT',
                status: 'DRAFT',
            }),
        });
        expect(tx.productionMaterial.createMany).toHaveBeenCalledWith({
            data: items.map((item) => ({ ...item, productionOrderId: 'po' })),
        });
    });
    it('reports shortage at the chosen source even if another warehouse has enough', async () => {
        tx.inventory.findMany.mockResolvedValue([
            {
                productVariantId: 'goods',
                locationId: 'fg',
                quantity: new Prisma.Decimal(100),
            },
            {
                productVariantId: 'wrap',
                locationId: 'fg',
                quantity: new Prisma.Decimal(100),
            },
        ]);
        await ProductionOrderService.createOrder(input, client());
        expect(tx.productionOrder.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ status: 'WAITING_MATERIAL' }),
        });
    });
    it.each([
        {
            id: 'supplies',
            name: 'Inactive',
            slug: 'inactive-supplies',
            locationPurpose: 'PACKING',
            locationType: 'INTERNAL',
        },
        { ...supplies, locationType: 'CUSTOMER_OWNED' },
        { ...supplies, id: 'other-tenant' },
    ])(
        'rejects ineligible or unknown source %j before creating anything',
        async (location) => {
            tx.location.findMany.mockResolvedValue([fg, location]);
            await expect(
                ProductionOrderService.createOrder(input, client()),
            ).rejects.toThrow(/lokasi asal/i);
            expect(tx.productionOrder.create).not.toHaveBeenCalled();
        },
    );
    it('rejects non-packing direct orders', async () => {
        tx.bom.findUnique.mockResolvedValue({
            id: 'bom',
            isActive: true,
            category: 'MIXING',
        });
        await expect(
            ProductionOrderService.createOrder(input, client()),
        ).rejects.toThrow(/packing/i);
    });
    it('rejects missing mappings for callers that bypass the action schema', async () => {
        const data = {
            ...input,
            items: [{ productVariantId: 'goods', quantity: 2 }],
        };
        await expect(
            ProductionOrderService.createOrder(data, client()),
        ).rejects.toThrow();
        expect(tx.productionOrder.create).not.toHaveBeenCalled();
    });
});