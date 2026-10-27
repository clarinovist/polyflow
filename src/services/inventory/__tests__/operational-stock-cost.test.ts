import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { requireOperationalInboundCost } from '../operational-stock-cost';

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
function client(variant: Record<string, unknown> | null, averageCost: Prisma.Decimal | null = null) {
    const db = {
        productVariant: { findUnique: vi.fn().mockResolvedValue(variant) },
        inventory: { findUnique: vi.fn().mockResolvedValue({ averageCost }) },
    };
    return { db, tx: db as unknown as Prisma.TransactionClient };
}
const atk = (extra: Record<string, unknown> = {}) => ({
    skuCode: 'ATK-1', standardCost: null, buyPrice: null, price: d(9000), product: { productType: 'OPERATIONAL' }, ...extra,
});

describe('requireOperationalInboundCost', () => {
    it('leaves other product types unchanged', async () => {
        const { db, tx } = client({ ...atk(), product: { productType: 'RAW_MATERIAL' } });
        expect(await requireOperationalInboundCost(tx, 'v', 'loc')).toBeNull();
        expect(db.inventory.findUnique).not.toHaveBeenCalled();
    });

    it.each([
        ['an entered unit cost', 5000, atk({ standardCost: d(3000), buyPrice: d(2000) }), d(4000), 5000],
        ['the location average', undefined, atk({ standardCost: d(3000), buyPrice: d(2000) }), d(4000), 4000],
        ['the standard cost', undefined, atk({ standardCost: d(3000), buyPrice: d(2000) }), d(0), 3000],
        ['the buy price', undefined, atk({ buyPrice: d(2000) }), null, 2000],
    ])('prefers %s', async (_label, entered, variant, average, expected) => {
        const { tx } = client(variant, average);
        expect(await requireOperationalInboundCost(tx, 'v', 'loc', entered)).toBe(expected);
    });

    it('rejects a cost-less operational receipt instead of using the sale price', async () => {
        const { tx } = client(atk(), d(0));
        await expect(requireOperationalInboundCost(tx, 'v', 'loc')).rejects.toMatchObject({
            code: 'OPERATIONAL_STOCK_COST_REQUIRED',
        });
    });
});
