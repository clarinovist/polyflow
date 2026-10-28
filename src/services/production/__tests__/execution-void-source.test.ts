import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { voidProductionExecutionInTransaction } from '../execution-void-helper';
import { reverseProductionMovementJournal } from '@/services/accounting/production-movement-reversal';
import { reversePackagedExecution } from '../packaging-reversal-service';
vi.mock('@/services/accounting/production-movement-reversal', () => ({ reverseProductionMovementJournal: vi.fn() }));
vi.mock('@/lib/core/actor-context', () => ({ getActorUserId: () => 'actor' }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/services/inventory/core-service', () => ({ InventoryCoreService: { deductStock: vi.fn(), incrementStock: vi.fn(), validateAndLockStock: vi.fn() } }));
vi.mock('@/services/inventory/reservation-service', () => ({ adjustReservationsForVoidOutput: vi.fn(), cancelSpecificReservation: vi.fn() }));
vi.mock('../packaging-reversal-service', () => ({ reversePackagedExecution: vi.fn() }));
vi.mock('../routing-execution-guard', () => ({ syncProductionRunStatusFromOrders: vi.fn() }));

it('voids output before material and stores unique source edges for both reversals', async () => {
    vi.clearAllMocks();
    const at = new Date();
    const execution = { id: 'execution', productionOrderId: 'wo', quantityProduced: 10, createdAt: at,
        endTime: at, status: 'COMPLETED', productionOrder: { id: 'wo' } };
    const base = { productionOrderId: 'wo', quantity: new Prisma.Decimal(10), cost: new Prisma.Decimal(5), reference: 'Original' };
    const issue = { ...base, id: 'issue', type: 'OUT', productVariantId: 'raw', fromLocationId: 'raw-stock' };
    const output = { ...base, id: 'output', type: 'IN', productVariantId: 'finished', toLocationId: 'output-stock' };
    const db = {
        $queryRaw: vi.fn(), auditLog: { findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null) },
        productionExecution: { findUnique: vi.fn().mockResolvedValue(execution), findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0), update: vi.fn() },
        productionOrder: { findUniqueOrThrow: vi.fn().mockResolvedValue({ actualQuantity: 10, plannedQuantity: 10 }), update: vi.fn() },
        stockMovement: { findMany: vi.fn().mockResolvedValue([issue, output]), findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn(async ({ data }) => ({ ...data, id: `undo-${data.reversalOfId}` })) },
        materialIssue: { updateMany: vi.fn() }, scrapRecord: { deleteMany: vi.fn() }, stockReservation: { updateMany: vi.fn() },
    };
    await voidProductionExecutionInTransaction(db as unknown as Prisma.TransactionClient, 'execution');
    expect(db.stockMovement.create.mock.calls.map(([args]) => args.data.reversalOfId)).toEqual(['output', 'issue']);
    expect(vi.mocked(reverseProductionMovementJournal).mock.calls.map(args => args[1].id)).toEqual(['output', 'issue']);
    expect(db.productionExecution.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'VOIDED' }) }));
});

describe('automatic zero-cost scrap reversal', () => {
    function fixture(downstream = false, quantity = 12, averageCost = 50) {
        vi.clearAllMocks();
        const at = new Date();
        const execution = { id: 'execution', clientRequestId: 'generic-kiosk-request', productionOrderId: 'wo',
            quantityProduced: 10, createdAt: at, endTime: at, status: 'COMPLETED',
            productionOrder: { id: 'wo', actualPackagingEnabled: false } };
        const scrap = { id: 'scrap', productionOrderId: 'wo', productionExecutionId: 'execution', companyOwned: true,
            type: 'IN', productVariantId: 'scrap-sku', toLocationId: 'scrap-stock', quantity: new Prisma.Decimal(2),
            cost: new Prisma.Decimal(0), createdAt: at, reference: 'Production Scrap' };
        const db = {
            $queryRaw: vi.fn(), auditLog: { findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null) },
            productionExecution: { findUnique: vi.fn().mockResolvedValue(execution), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), update: vi.fn() },
            productionOrder: { findUniqueOrThrow: vi.fn().mockResolvedValue({ actualQuantity: 10, plannedQuantity: 20 }), update: vi.fn() },
            stockMovement: { findMany: vi.fn().mockResolvedValue([scrap]), findFirst: vi.fn(async ({ where }) => where.fromLocationId && downstream ? { id: 'downstream' } : null),
                create: vi.fn(async ({ data }) => ({ ...data, id: 'undo-scrap' })) },
            inventory: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'stock', quantity: new Prisma.Decimal(quantity), averageCost: new Prisma.Decimal(averageCost) }), update: vi.fn() },
            materialIssue: { updateMany: vi.fn() }, scrapRecord: { deleteMany: vi.fn() }, stockReservation: { updateMany: vi.fn() },
        };
        return { db, tx: db as unknown as Prisma.TransactionClient };
    }
    it.each([[12, 50, 10, 60], [2, 0, 0, 0]])('preserves inventory value and source identity when removing zero-cost scrap', async (qty, cost, remaining, restored) => {
        const { db, tx } = fixture(false, qty, cost);
        await voidProductionExecutionInTransaction(tx, 'execution');
        expect(reversePackagedExecution).not.toHaveBeenCalled();
        expect(db.stockMovement.findMany).toHaveBeenCalledWith({ where: { productionOrderId: 'wo', OR: [
            { createdAt: expect.any(Object), productionExecutionId: null },
            { productionExecutionId: 'execution', reversalOfId: null },
        ] } });
        expect(db.inventory.update).toHaveBeenCalledWith({ where: { id: 'stock' }, data: {
            quantity: new Prisma.Decimal(remaining), averageCost: restored ? new Prisma.Decimal(restored) : 0,
        } });
        expect(db.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({
            cost: new Prisma.Decimal(0), companyOwned: true, productionExecutionId: 'execution', reversalOfId: 'scrap',
        }) });
    });
    it('still delegates actual-packaging orders to their source reversal pipeline', async () => {
        const { db, tx } = fixture();
        const execution = await db.productionExecution.findUnique();
        execution.productionOrder.actualPackagingEnabled = true;
        vi.mocked(reversePackagedExecution).mockResolvedValue([]);
        await voidProductionExecutionInTransaction(tx, 'execution');
        expect(reversePackagedExecution).toHaveBeenCalledWith(tx, 'execution', 'wo');
        expect(db.stockMovement.findMany).not.toHaveBeenCalled();
    });
    it('rejects a new execution whose legacy time window overlaps a frozen movement', async () => {
        const { db, tx } = fixture();
        db.auditLog.findUnique.mockResolvedValue({ action:'START_PRODUCTION_COST_PERIOD',entityType:'ProductionOrder',entityId:'wo',changes:{version:1,orderId:'wo',movementIds:['scrap'],executionIds:['older-execution'],sourceHash:'a'.repeat(64),executionHash:'b'.repeat(64),fingerprint:'c'.repeat(64),historicalBalances:[]} } as never);
        await expect(voidProductionExecutionInTransaction(tx,'execution')).rejects.toThrow('jendela pembatalan');
        expect(db.stockMovement.create).not.toHaveBeenCalled();
        expect(db.inventory.update).not.toHaveBeenCalled();
    });
    it('rejects consumed scrap before valuation/reversal changes', async () => {
        const { db, tx } = fixture(true);
        await expect(voidProductionExecutionInTransaction(tx, 'execution')).rejects.toThrow('dipindahkan/digunakan');
        expect(db.inventory.update).not.toHaveBeenCalled();
        expect(db.stockMovement.create).not.toHaveBeenCalled();
    });
    it('rejects value left without stock rather than discarding it', async () => {
        const { db, tx } = fixture(false, 2, 10);
        await expect(voidProductionExecutionInTransaction(tx, 'execution')).rejects.toThrow('Nilai stok affal');
        expect(db.inventory.update).not.toHaveBeenCalled();
    });
});

describe('void source identity contract', () => {
    it('retains the database unique reversal edge in the existing schema', async () => {
        const { readFileSync } = await import('node:fs');
        expect(readFileSync('prisma/schema.prisma', 'utf8')).toMatch(/reversalOfId\s+String\?\s+@unique/);
    });
});
