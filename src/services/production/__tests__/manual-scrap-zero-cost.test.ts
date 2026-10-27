import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type StockMovement } from '@prisma/client';
import { tenantContext } from '@/lib/core/prisma';
import { ProductionMaterialService } from '../material-service';
import { removeZeroCostScrapReceipt } from '../zero-cost-scrap-removal';
import { recordInventoryMovement } from '@/services/accounting/inventory-link-service';
import { allocateProductionWip } from '@/services/accounting/production-wip-provenance';
import { InventoryCoreService } from '@/services/inventory/core-service';

vi.mock('@/services/inventory/core-service', () => ({ InventoryCoreService: {
    incrementStock: vi.fn(), incrementStockWithCost: vi.fn(), validateAndLockStock: vi.fn(), deductStock: vi.fn(),
} }));
const createJournalEntry = vi.hoisted(() => vi.fn());
vi.mock('@/services/accounting/journals-service', () => ({ createJournalEntry }));
vi.mock('@/services/accounting/accounting-service', () => ({ AccountingService: {
    recordInventoryMovement: (...args: Parameters<typeof recordInventoryMovement>) => recordInventoryMovement(...args),
} }));

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const line = (accountId: string, debit: number, credit: number) => ({
    accountId, debit: d(debit), credit: d(credit), currency: 'IDR', exchangeRate: d(1), account: { type: 'ASSET' },
});
function setup(isMaklon = false) {
    const movements: StockMovement[] = [];
    const db = {
        $queryRaw: vi.fn(),
        productionOrder: {
            findUnique: vi.fn().mockResolvedValue({ orderNumber: 'WO-SYNTHETIC', isMaklon }),
            findUniqueOrThrow: vi.fn().mockResolvedValue({ isMaklon }),
        },
        productVariant: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
            id: where.id, standardCost: null, buyPrice: null, price: d(7000), product: { productType: 'SCRAP' },
        })) },
        stockMovement: {
            create: vi.fn(async ({ data }: { data: Prisma.StockMovementUncheckedCreateInput }) => {
                const move = { goodsReceiptId: null, salesOrderId: null, reversalOfId: null, fromLocationId: null,
                    toLocationId: null, productionExecutionId: null, ...data, id: `move-${movements.length}`,
                    quantity: d(Number(data.quantity)), cost: data.cost == null ? null : d(String(data.cost)), createdAt: new Date(),
                } as StockMovement;
                movements.push(move); return move;
            }),
            findMany: vi.fn(async () => movements),
            findFirst: vi.fn().mockResolvedValue(null),
        },
        scrapRecord: { create: vi.fn(async () => ({ id: 'manual-scrap' })), findUnique: vi.fn(), delete: vi.fn() },
        inventory: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
        journalEntry: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
        auditLog: { create: vi.fn() },
    };
    const tx = db as unknown as Prisma.TransactionClient;
    const client = { $transaction: (fn: (inner: Prisma.TransactionClient) => Promise<unknown>) => fn(tx) };
    const asTenant = <T>(fn: () => Promise<T>) => tenantContext.run(client as never, fn);
    return { db, tx, movements, asTenant };
}
const manual = { productionOrderId: 'wo', productVariantId: 'leaf', locationId: 'scrap-store', quantity: 2, userId: 'actor', reason: 'Manual affal' };

describe('manual SPK affal at zero allocated cost', () => {
    beforeEach(() => vi.clearAllMocks());

    it.each([false, true])('records zero cost, order ownership and an exact link without a sale-price journal (maklon=%s)', async isMaklon => {
        const { db, tx, movements } = setup(isMaklon);
        await ProductionMaterialService.recordScrap(manual, tx);
        expect(movements).toHaveLength(1);
        expect(movements[0]).toMatchObject({ productionExecutionId: undefined, companyOwned: !isMaklon,
            reference: 'Production Scrap: WO-SYNTHETIC [SCRAP:manual-scrap]' });
        expect(movements[0].cost?.toString()).toBe('0');
        expect(InventoryCoreService.incrementStockWithCost).toHaveBeenCalledWith(tx, 'scrap-store', 'leaf', 2, 0);
        expect(InventoryCoreService.incrementStock).not.toHaveBeenCalled();
        expect(db.$queryRaw).toHaveBeenCalled();
        expect(createJournalEntry).not.toHaveBeenCalled();
        expect(db.productVariant.findUnique).toHaveBeenCalled(); // price 7000 was available but unused
    });

    it('does not reduce or block the next output funding', async () => {
        const { db, tx, movements } = setup();
        await ProductionMaterialService.recordScrap(manual, tx);
        const issue = { ...movements[0], id: 'issue', type: 'OUT', productVariantId: 'raw', cost: d(10), reference: 'Backflush' } as StockMovement;
        db.stockMovement.findMany.mockResolvedValue([issue, movements[0]]);
        db.journalEntry.findMany.mockResolvedValue([{ id: 'j-issue', referenceId: 'issue', status: 'POSTED', isAutoGenerated: true,
            referenceType: 'MANUAL_ENTRY', lines: [line('wip', 100, 0), line('raw', 0, 100)] }] as never);
        const output = { ...issue, id: 'output', type: 'IN', productVariantId: 'fg' } as StockMovement;
        expect(await allocateProductionWip(tx, output, d(100))).toEqual([{ accountId: 'wip', credit: d(100) }]);
    });

    it('deletes a linked record by reversing its exact zero-cost receipt and restoring pre-receipt value', async () => {
        const { db, movements, asTenant } = setup();
        const receipt = { id: 'receipt', type: 'IN', productVariantId: 'leaf', productionOrderId: 'wo', quantity: d(2), cost: d(0),
            toLocationId: 'scrap-store', fromLocationId: null, reversalOfId: null, companyOwned: true, createdAt: new Date(),
            reference: 'Production Scrap: WO-SYNTHETIC [SCRAP:manual-scrap]', goodsReceiptId: null, salesOrderId: null } as StockMovement;
        db.scrapRecord.findUnique.mockResolvedValue({ id: 'manual-scrap', productionOrderId: 'wo', productionExecutionId: null });
        db.stockMovement.findMany.mockResolvedValue([receipt]);
        db.inventory.findUniqueOrThrow.mockResolvedValue({ id: 'stock', quantity: d(12), averageCost: d(50) });
        await asTenant(() => ProductionMaterialService.deleteScrap('manual-scrap', 'wo', 'actor'));
        expect(db.stockMovement.findMany).toHaveBeenCalledWith({ where: expect.objectContaining({
            productionOrderId: 'wo', reversalOfId: null, reference: { endsWith: '[SCRAP:manual-scrap]' } }) });
        expect(db.inventory.update).toHaveBeenCalledWith({ where: { id: 'stock' }, data: { quantity: d(10), averageCost: d(60) } });
        expect(movements[0]).toMatchObject({ type: 'OUT', reversalOfId: 'receipt', fromLocationId: 'scrap-store',
            reference: 'VOID: Production Scrap: WO-SYNTHETIC [SCRAP:manual-scrap]', companyOwned: true });
        expect(movements[0].cost?.toString()).toBe('0');
        expect(db.scrapRecord.delete).toHaveBeenCalledWith({ where: { id: 'manual-scrap' } });
        expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'DELETE_SCRAP_RECORD', userId: 'actor' }) });
    });

    it('rejects a second reversal of the same receipt before touching stock', async () => {
        const { db, asTenant } = setup();
        db.scrapRecord.findUnique.mockResolvedValue({ id: 'manual-scrap', productionOrderId: 'wo', productionExecutionId: null });
        db.stockMovement.findMany.mockResolvedValue([{ id: 'receipt', cost: d(0), reference: '[SCRAP:manual-scrap]' }] as never);
        db.stockMovement.findFirst.mockResolvedValue({ id: 'earlier-reversal' });
        await expect(asTenant(() => ProductionMaterialService.deleteScrap('manual-scrap', 'wo', 'actor'))).rejects.toThrow('sudah dibalik');
        expect(InventoryCoreService.validateAndLockStock).not.toHaveBeenCalled();
        expect(db.stockMovement.create).not.toHaveBeenCalled();
    });

    it('keeps an unknown aggregate WAC unknown when a zero-cost receipt is removed', async () => {
        const { db, tx } = setup();
        db.inventory.findUniqueOrThrow.mockResolvedValue({ id: 'stock', quantity: d(12), averageCost: null });
        await removeZeroCostScrapReceipt(tx, { id: 'receipt', type: 'IN', productVariantId: 'leaf', toLocationId: 'scrap-store',
            quantity: d(2), cost: d(0), createdAt: new Date() } as StockMovement);
        expect(db.inventory.update).toHaveBeenCalledWith({ where: { id: 'stock' }, data: { quantity: d(10) } });
    });

    it('rejects removing a receipt that was used downstream', async () => {
        const { db, tx } = setup();
        db.stockMovement.findFirst.mockResolvedValue({ id: 'sold' });
        await expect(removeZeroCostScrapReceipt(tx, { id: 'receipt', type: 'IN', productVariantId: 'leaf', toLocationId: 'scrap-store',
            quantity: d(2), cost: d(0), createdAt: new Date() } as StockMovement)).rejects.toThrow('sudah dipindahkan');
        expect(db.inventory.update).not.toHaveBeenCalled();
    });

    it('refuses a valued receipt instead of expensing it through the zero-cost path', async () => {
        const { tx } = setup();
        await expect(removeZeroCostScrapReceipt(tx, { id: 'receipt', type: 'IN', productVariantId: 'leaf', toLocationId: 'scrap-store',
            quantity: d(2), cost: d(5), createdAt: new Date() } as StockMovement)).rejects.toThrow('bernilai nol');
    });
});
