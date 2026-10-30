import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { recordFinishedGoodsOutput } from '../../production/execution-output-posting';
import { recordInventoryMovement } from '../inventory-link-service';
import { backflushMaterials } from '../../production/execution-material-consumption';
import type { ProductionExecutionOrder } from '../../production/execution-types';

const journal = vi.hoisted(() => vi.fn());
vi.mock('@/lib/core/prisma', () => ({ prisma: {} }));
vi.mock('../journals-service', () => ({ createJournalEntry: journal }));
vi.mock('@/actions/finance/cost-history', () => ({ updateStandardCostInternal: vi.fn() }));
vi.mock('../accounting-service', async () => ({ AccountingService: {
    recordInventoryMovement: (await import('../inventory-link-service')).recordInventoryMovement,
} }));
vi.mock('../../inventory/core-service', () => ({ InventoryCoreService: { incrementStockWithCost: vi.fn(), validateAndLockStock: vi.fn(), deductStock: vi.fn() } }));
vi.mock('../../production/execution-material-location', () => ({ resolveMaterialLocation: vi.fn(async () => 'loc') }));
vi.mock('../../inventory/reservation-service', () => ({ createStockReservation: vi.fn(), getSalesOrderResidualDemand: vi.fn() }));
const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

describe('production output monetary rounding', () => {
    beforeEach(() => vi.clearAllMocks());
    it('posts the source-funded monetary value rather than reconstructing it from 4dp unit cost', async () => {
        const f = fixture([['350', '3570.1728'], ['350', '11818.1818'], ['11', '21080.2253']]);
        await f.post();
        expect(journal).toHaveBeenCalledWith(expect.objectContaining({ referenceId: 'output', lines: [
            expect.objectContaining({ debit: 5617806.59, credit: 0 }),
            expect.objectContaining({ debit: 0, credit: 5617806.59 }),
        ] }), f.tx);
        const saved = await f.db.stockMovement.findUnique();
        expect(saved?.cost).toEqual(d('7901.2751'));
    });
    it('accepts an exact GL balance without binary subtraction drift', async () => {
        const f = fixture([['74.06', '14.5299']], '74.06');
        f.db.journalLine.aggregate.mockResolvedValue({ _sum: { debit: d('2479.24'), credit: d('1403.16') } });
        await f.post();
        expect(journal.mock.calls[0][0].lines[0].debit).toBe(1076.08);
    });
    it('still rejects a true one-cent GL shortage after source allocation', async () => {
        const f = fixture([['74.06', '14.5299']], '74.06');
        f.db.journalLine.aggregate.mockResolvedValue({ _sum: { debit: d('2479.24'), credit: d('1403.17') } });
        await expect(f.post()).rejects.toMatchObject({ code: 'INVENTORY_GL_INSUFFICIENT', message: expect.stringContaining('saldo pembukuan persediaan belum cukup'), details: expect.objectContaining({ accountCode: expect.any(String) }) });
        expect(journal).not.toHaveBeenCalled();
    });
    it('rounds the material journal amount before passing it to the journal writer', async () => {
        const f = fixture([], '1');
        await recordInventoryMovement({ id: 'material', type: 'OUT', productionOrderId: 'wo', productVariantId: 'raw',
            quantity: d(1), cost: d('1.005'), fromLocationId: 'loc',
        } as never, f.tx);
        expect(journal.mock.calls[0][0].lines[0].debit).toBe(1.01);
    });
    it('rounds each material contribution as its journal does, not just the aggregate', async () => {
        const f = fixture([['1', '1.004'], ['1', '1.004']], '2');
        await f.post();
        expect(journal.mock.calls[0][0].lines[0].debit).toBe(2);
    });
    it('does not average earlier material rounding into the next partial result', async () => {
        // Earlier outputs already relieved the first three materials' journal cents.
        const f = fixture([['6.71', '14.5299'], ['62.1', '14.5299'], ['27.76', '14.5299'], ['74.06', '14.5299']], '170.63', '0', '1403.16');
        await f.post(74.06);
        expect(journal.mock.calls[0][0].lines[0].debit).toBe(1076.08);
    });
    it('carries only new multi-material cents into a later output', async () => {
        const f = fixture([['1', '1.004'], ['1', '1.004'], ['1', '1.004'], ['1', '1.004']], '4', '0', '2');
        await f.post(2, -0.01);
        expect(journal.mock.calls[0][0].lines[0].debit).toBe(2);
    });
    it.each([NaN, Infinity, -1, 1.001])('rejects invalid monetary value %s', async value => {
        const f = fixture([['10', '10']], '10');
        const movement = await f.db.stockMovement.create({ data: {
            type: 'IN', productionOrderId: 'wo', productVariantId: 'finished', quantity: 10, cost: 10,
        } });
        await expect(recordInventoryMovement(movement as never, f.tx, { productionOutput: true, journalTotal: value }))
            .rejects.toThrow('nilai hasil');
        expect(journal).not.toHaveBeenCalled();
    });
    it('still rejects a real one-cent shortage with an explicit exact amount', async () => {
        const f = fixture([['10', '9.999']], '10');
        const movement = await f.db.stockMovement.create({ data: {
            type: 'IN', productionOrderId: 'wo', productVariantId: 'finished', quantity: 10, cost: 10,
        } });
        await expect(recordInventoryMovement(movement as never, f.tx, { productionOutput: true, journalTotal: 100 }))
            .rejects.toMatchObject({ code: 'PRODUCTION_WIP_MATERIAL_SHORTAGE' });
        expect(journal).not.toHaveBeenCalled();
    });
    it('uses the existing journal on replay instead of recalculating its rounded value', async () => {
        const f = fixture([['350', '3570.1728'], ['350', '11818.1818'], ['11', '21080.2253']]);
        await f.post();
        f.db.journalEntry.findFirst.mockResolvedValue({ id: 'existing' } as never);
        const movement = await f.db.stockMovement.findUnique();
        await recordInventoryMovement(movement as never, f.tx, { productionOutput: true });
        expect(journal).toHaveBeenCalledTimes(1);
    });
    it('returns only the current backflush material rounding difference', async () => {
        const f = fixture([], '2');
        const db = { ...f.db, inventory: { findUnique: vi.fn(async () => ({ averageCost: d('1.004') })) },
            materialIssue: { findMany: vi.fn(async () => []), create: vi.fn() },
            stockMovement: { ...f.db.stockMovement, findFirst: vi.fn(async () => null) },
        };
        const result = await backflushMaterials({ tx: db as unknown as Prisma.TransactionClient,
            productionOrderId: 'wo', totalConsumed: 2, reference: 'Synthetic',
            order: { ...f.order, plannedQuantity: 2, plannedMaterials: [
                { productVariantId: 'raw-1', quantity: 1 }, { productVariantId: 'raw-2', quantity: 1 },
            ] } as unknown as ProductionExecutionOrder,
        });
        expect(result).toEqual({ roundingAdjustment: -0.01 });
    });
    it('keeps genuine conversion underfunding blocked instead of clamping to WIP', async () => {
        const f = fixture([['10', '10']], '10', '1');
        await expect(f.post()).rejects.toMatchObject({ code: 'PRODUCTION_CONVERSION_UNFUNDED' });
        await expect(f.post()).rejects.toThrow('Hasil belum disimpan');
        expect(journal).not.toHaveBeenCalled();
    });
    it('rejects an arbitrary monetary override even when the WO has enough WIP', async () => {
        const f = fixture([['10', '10']], '10');
        const movement = await f.db.stockMovement.create({ data: {
            type: 'IN', productionOrderId: 'wo', productVariantId: 'finished', quantity: 10, cost: 10,
        } });
        await expect(recordInventoryMovement(movement as never, f.tx, { productionOutput: true, journalTotal: 1 }))
            .rejects.toThrow('nilai hasil');
        expect(journal).not.toHaveBeenCalled();
    });
});

type Input = readonly [string, string];
function fixture(inputs: readonly Input[], yieldQty = '711', conversion = '0', priorOutput?: string) {
    const source = inputs.map(([quantity, cost], index) => ({
        id: `source-${index}`, type: 'OUT', productVariantId: `raw-${index}`,
        productionOrderId: 'wo', quantity: d(quantity), cost: d(cost),
    }));
    if (priorOutput) source.push({ id: 'prior-output', type: 'IN', productVariantId: 'finished',
        productionOrderId: 'wo', quantity: d(1), cost: d(priorOutput) });
    const sources = source.map(m => {
        const amount = m.quantity.mul(m.cost).toDecimalPlaces(2);
        const [debit, credit] = m.type === 'OUT' ? ['wip', 'raw'] : ['inventory', 'wip'];
        return { id: `journal-${m.id}`, referenceId: m.id,
            status: 'POSTED', isAutoGenerated: true, referenceType: 'MANUAL_ENTRY',
            lines: [
                { accountId: debit, debit: amount, credit: d(0) },
                { accountId: credit, debit: d(0), credit: amount },
            ].map(line => ({ ...line, account: { type: 'ASSET' }, currency: 'IDR', exchangeRate: d(1) })),
        };
    });
    const order = { id: 'wo', orderNumber: 'SYNTHETIC', locationId: 'loc', actualQuantity: d(yieldQty),
        estimatedConversionCost: d(conversion), isMaklon: false, bom: { productVariantId: 'finished' } };
    const productVariant = { name: 'Synthetic output', product: { productType: 'INTERMEDIATE', inventoryAccountId: 'inventory', wipAccountId: 'wip' } };
    let output: Record<string, unknown> | null = null;
    const db = {
        auditLog: { findUnique: vi.fn().mockResolvedValue(null) },
        productionOrder: { findUnique: vi.fn(async () => order), findUniqueOrThrow: vi.fn(async () => order) },
        stockMovement: {
            findMany: vi.fn(async () => source),
            findUnique: vi.fn(async () => output),
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
                output = { ...data, id: 'output', quantity: d(String(data.quantity)).toDecimalPlaces(4), cost: d(String(data.cost)).toDecimalPlaces(4) };
                return output;
            }),
        },
        journalEntry: { findMany: vi.fn(async () => sources), findFirst: vi.fn(async () => null) },
        productVariant: { findUnique: vi.fn(async () => productVariant) },
        account: { findUnique: vi.fn(async ({ where }: { where: { code?: string; id?: string } }) => ({ id: where.code ?? where.id, code: where.code ?? where.id, type: 'ASSET' })) },
        journalLine: { aggregate: vi.fn(async () => ({ _sum: { debit: d('999999999'), credit: d(0) } })) },
        $queryRaw: vi.fn(async () => []),
    };
    const tx = db as unknown as Prisma.TransactionClient;
    return { db, tx, order, post: (quantity = Number(yieldQty), materialRoundingAdjustment?: number) => recordFinishedGoodsOutput({
        tx, order: order as unknown as ProductionExecutionOrder, productionOrderId: 'wo', quantityProduced: quantity, materialRoundingAdjustment, reference: 'Synthetic output',
    }) };
}
