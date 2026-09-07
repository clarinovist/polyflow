import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { createProductionOrderSchema } from '@/lib/schemas/production';
import { resolveMaterialLocation } from '../execution-material-location';

const items = [
    { productVariantId: 'goods', quantity: 10, sourceLocationId: 'fg' },
    { productVariantId: 'wrap', quantity: 2, sourceLocationId: 'supplies' },
];
const input = {
    bomId: 'bom',
    locationId: 'output',
    plannedQuantity: 10,
    plannedStartDate: new Date('2026-09-07T01:00:00Z'),
    materialConsumptionMode: 'DIRECT',
    items,
};

describe('direct material consumption contract', () => {
    it('preserves mode and per-material warehouses through input parsing', () => {
        expect(createProductionOrderSchema.parse(input)).toMatchObject(input);
    });
    it.each([
        { items: [] },
        { items: [{ productVariantId: 'goods', quantity: 1 }] },
        { items: [items[0], items[0]] },
        { items: [{ ...items[0], quantity: -1 }] },
        { materialConsumptionLocationId: 'floor' },
        { materialConsumptionMode: 'UNKNOWN' },
        { isMaklon: true, maklonCustomerId: 'customer' },
    ])('rejects invalid direct input: %j', (override) => {
        expect(
            createProductionOrderSchema.safeParse({ ...input, ...override })
                .success,
        ).toBe(false);
    });
    it('keeps transfer input backward compatible', () => {
        const { materialConsumptionMode: _mode, ...legacy } = input;
        expect(
            createProductionOrderSchema.safeParse({
                ...legacy,
                items: undefined,
            }).success,
        ).toBe(true);
    });
    it('resolves each material from its saved warehouse, never the output warehouse', async () => {
        const tx = {
            inventory: { findUnique: vi.fn() },
            location: { findUnique: vi.fn() },
        };
        const order = {
            locationId: 'output',
            isMaklon: false,
            bom: { category: 'PACKING' },
            materialConsumptionMode: 'DIRECT' as const,
            plannedMaterials: items,
        };
        expect(
            await resolveMaterialLocation(
                tx as unknown as Prisma.TransactionClient,
                order,
                'goods',
            ),
        ).toBe('fg');
        expect(
            await resolveMaterialLocation(
                tx as unknown as Prisma.TransactionClient,
                order,
                'wrap',
            ),
        ).toBe('supplies');
        expect(tx.inventory.findUnique).not.toHaveBeenCalled();
    });
    it('fails closed when a direct material has no saved source', async () => {
        const order = {
            locationId: 'output',
            isMaklon: false,
            bom: { category: 'PACKING' },
            materialConsumptionMode: 'DIRECT' as const,
            plannedMaterials: [],
        };
        await expect(
            resolveMaterialLocation(
                {} as Prisma.TransactionClient,
                order,
                'wrap',
            ),
        ).rejects.toThrow(/lokasi asal/i);
    });
});