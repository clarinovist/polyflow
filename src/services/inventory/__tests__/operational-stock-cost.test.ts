import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { resolveInboundAdjustmentCost } from '../operational-stock-cost';

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
function client(variant: Record<string, unknown> | null, averageCost: Prisma.Decimal | null = null) {
    const db = {
        productVariant: { findUnique: vi.fn().mockResolvedValue(variant) },
        inventory: { findUnique: vi.fn().mockResolvedValue({ averageCost }) },
    };
    return { db, tx: db as unknown as Prisma.TransactionClient };
}
const variantOf = (productType: string) => (extra: Record<string, unknown> = {}) => ({
    skuCode: `${productType}-1`, standardCost: null, buyPrice: null, price: d(9000), product: { productType }, ...extra,
});
const atk = variantOf('OPERATIONAL');
const raw = variantOf('RAW_MATERIAL');

describe('resolveInboundAdjustmentCost', () => {
    it.each([
        ['an entered unit cost', 5000, d(4000), 5000],
        ['the location average', undefined, d(4000), 4000],
        ['the standard cost', undefined, d(0), 3000],
    ])('prefers %s for every product type', async (_label, entered, average, expected) => {
        for (const variant of [atk, raw]) {
            const { tx } = client(variant({ standardCost: d(3000), buyPrice: d(2000) }), average);
            expect(await resolveInboundAdjustmentCost(tx, 'v', 'loc', entered)).toBe(expected);
        }
    });

    it('falls back to the buy price, never the sale price', async () => {
        const { tx } = client(raw({ buyPrice: d(2000) }), null);
        expect(await resolveInboundAdjustmentCost(tx, 'v', 'loc')).toBe(2000);
    });

    it('rejects a cost-less operational receipt instead of using the sale price', async () => {
        const { tx } = client(atk(), d(0));
        await expect(resolveInboundAdjustmentCost(tx, 'v', 'loc')).rejects.toMatchObject({
            code: 'OPERATIONAL_STOCK_COST_REQUIRED',
        });
    });

    it('values other stock without any cost source at an explicit zero instead of the sale price', async () => {
        const { tx } = client(raw(), d(0));
        expect(await resolveInboundAdjustmentCost(tx, 'v', 'loc')).toBe(0);
        const scrap = client(variantOf('SCRAP')(), null);
        expect(await resolveInboundAdjustmentCost(scrap.tx, 'v', 'loc')).toBe(0);
    });
});
