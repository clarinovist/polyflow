import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type StockMovement } from '@prisma/client';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { removeZeroCostScrapReceipt } from '../zero-cost-scrap-removal';

vi.mock('@/services/inventory/core-service', () => ({ InventoryCoreService: { validateAndLockStock: vi.fn() } }));
const d = (value: number) => new Prisma.Decimal(value);
const at = new Date('2026-01-01T00:00:00Z');
function movement(overrides: Partial<StockMovement> = {}): StockMovement {
    return {
        id: 'receipt-a', type: 'IN', productVariantId: 'scrap', fromLocationId: null, toLocationId: 'store',
        quantity: d(2), cost: d(0), productionOrderId: 'order-a', productionExecutionId: 'execution-a',
        reversalOfId: null, companyOwned: true, packagingOwnerCustomerId: null, createdAt: at,
        reference: 'Synthetic scrap', createdById: null, batchId: null, salesOrderId: null, goodsReceiptId: null,
        ...overrides,
    };
}
type Candidate = StockMovement & {
    reversalOf: StockMovement | null;
    reversedBy: { id: string } | null;
    productionExecution: { status: string } | null;
};
function receiptReversal(id = 'out-b'): Candidate {
    const source = movement({ id: `source-${id}`, productionOrderId: 'order-b', productionExecutionId: 'execution-b' });
    return {
        ...source, id, type: 'OUT', fromLocationId: 'store', toLocationId: null, reversalOfId: source.id,
        createdAt: new Date(at.getTime() + 1000), reversalOf: source, reversedBy: null,
        productionExecution: { status: 'VOIDED' }, reference: 'VOID: Synthetic scrap',
    };
}
function fixture(candidates: Candidate[] = [], averageCost: number | null = 0) {
    const db = {
        stockMovement: { findFirst: vi.fn(async ({ where }: { where: Prisma.StockMovementWhereInput }) => {
            const after = (where.id as Prisma.StringFilter | undefined)?.gt as string | undefined;
            return [...candidates].sort((a, b) => a.id.localeCompare(b.id)).find(m => !after || m.id > after) ?? null;
        }) },
        inventory: {
            findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'inventory', quantity: d(12), averageCost: averageCost === null ? null : d(averageCost) }),
            update: vi.fn(),
        },
    };
    return { db, tx: db as unknown as Prisma.TransactionClient };
}

describe('zero-cost scrap downstream identity', () => {
    beforeEach(() => vi.resetAllMocks());

    it('does not mistake another output receipt reversal for consumption', async () => {
        const { db, tx } = fixture([receiptReversal()], 50);
        await removeZeroCostScrapReceipt(tx, movement(), 'execution-a');
        expect(InventoryCoreService.validateAndLockStock).toHaveBeenCalledWith(tx, 'store', 'scrap', 2);
        expect(db.stockMovement.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ productVariantId: 'scrap', fromLocationId: 'store', createdAt: { gte: at },
                type: { in: ['OUT', 'TRANSFER'] }, OR: [{ productionExecutionId: null }, { productionExecutionId: { not: 'execution-a' } }] }),
        }));
        expect(db.inventory.update).toHaveBeenCalledWith({ where: { id: 'inventory' }, data: { quantity: d(10), averageCost: d(60) } });
    });

    it('also accepts exact manual receipt reversals without execution attribution or a magic reference prefix', async () => {
        const candidate = receiptReversal();
        candidate.productionExecutionId = null;
        candidate.productionExecution = null;
        candidate.reversalOf!.productionExecutionId = null;
        candidate.reference = 'Synthetic exact source edge';
        const { db, tx } = fixture([candidate], null);
        await removeZeroCostScrapReceipt(tx, movement({ productionExecutionId: null }));
        expect(db.inventory.update).toHaveBeenCalledWith({ where: { id: 'inventory' }, data: { quantity: d(10) } });
        expect(db.stockMovement.findFirst.mock.calls[0][0].where).not.toHaveProperty('OR');
    });

    it('advances through every valid reversal without loading the entire ledger', async () => {
        const { db, tx } = fixture([receiptReversal('out-b'), receiptReversal('out-c')]);
        await removeZeroCostScrapReceipt(tx, movement(), 'execution-a');
        expect(db.stockMovement.findFirst).toHaveBeenCalledTimes(3);
        expect(db.stockMovement.findFirst.mock.calls[1][0].where.id).toEqual({ gt: 'out-b' });
        expect(db.stockMovement.findFirst.mock.calls[2][0].where.id).toEqual({ gt: 'out-c' });
    });

    it.each(['OUT', 'TRANSFER'] as const)('still rejects a real %s after an ignorable receipt reversal', async type => {
        const consumed = { ...receiptReversal('out-z'), type, reversalOfId: null, reversalOf: null };
        const { db, tx } = fixture([receiptReversal(), consumed]);
        await expect(removeZeroCostScrapReceipt(tx, movement(), 'execution-a')).rejects.toThrow('dipindahkan/digunakan');
        expect(db.stockMovement.findFirst).toHaveBeenCalledTimes(2);
        expect(db.inventory.update).not.toHaveBeenCalled();
    });

    const invalid: [string, (m: Candidate) => void][] = [
        ['missing source edge', m => { m.reversalOfId = null; }],
        ['missing source', m => { m.reversalOf = null; }],
        ['wrong source edge', m => { m.reversalOfId = 'different'; }],
        ['target receipt itself', m => { m.reversalOf!.id = 'receipt-a'; m.reversalOfId = 'receipt-a'; }],
        ['source is another reversal', m => { m.reversalOf!.reversalOfId = 'older'; }],
        ['source is not IN', m => { m.reversalOf!.type = 'OUT'; }],
        ['reversal was reversed', m => { m.reversedBy = { id: 'redo' }; }],
        ['different quantity', m => { m.quantity = d(1); }],
        ['nonpositive quantity', m => { m.quantity = d(0); m.reversalOf!.quantity = d(0); }],
        ['unknown source cost', m => { m.reversalOf!.cost = null; }],
        ['valued source', m => { m.cost = d(1); m.reversalOf!.cost = d(1); }],
        ['unknown reversal cost', m => { m.cost = null; }],
        ['different SKU', m => { m.reversalOf!.productVariantId = 'other'; }],
        ['different location', m => { m.reversalOf!.toLocationId = 'elsewhere'; }],
        ['source has outbound location', m => { m.reversalOf!.fromLocationId = 'elsewhere'; }],
        ['reversal has inbound location', m => { m.toLocationId = 'elsewhere'; }],
        ['different order', m => { m.reversalOf!.productionOrderId = 'elsewhere'; }],
        ['not a production receipt', m => { m.productionOrderId = null; m.reversalOf!.productionOrderId = null; }],
        ['different execution', m => { m.reversalOf!.productionExecutionId = 'elsewhere'; }],
        ['execution not voided', m => { m.productionExecution = { status: 'COMPLETED' }; }],
        ['missing attributed execution', m => { m.productionExecution = null; }],
        ['different ownership', m => { m.companyOwned = false; }],
        ['different customer custody', m => { m.packagingOwnerCustomerId = 'other'; }],
        ['sales movement', m => { m.salesOrderId = 'sale'; }],
        ['goods receipt', m => { m.reversalOf!.goodsReceiptId = 'purchase'; }],
        ['source newer than reversal', m => { m.reversalOf!.createdAt = new Date(at.getTime() + 2000); }],
    ];
    it.each(invalid)('fails closed for %s', async (_name, invalidate) => {
        const candidate = receiptReversal();
        invalidate(candidate);
        const { db, tx } = fixture([candidate]);
        await expect(removeZeroCostScrapReceipt(tx, movement(), 'execution-a')).rejects.toThrow('dipindahkan/digunakan');
        expect(db.inventory.update).not.toHaveBeenCalled();
    });

    it('still enforces stock availability before examining downstream history', async () => {
        const { db, tx } = fixture([receiptReversal()]);
        vi.mocked(InventoryCoreService.validateAndLockStock).mockRejectedValueOnce(new Error('Insufficient stock'));
        await expect(removeZeroCostScrapReceipt(tx, movement())).rejects.toThrow('Insufficient stock');
        expect(db.stockMovement.findFirst).not.toHaveBeenCalled();
        expect(db.inventory.update).not.toHaveBeenCalled();
    });
});
