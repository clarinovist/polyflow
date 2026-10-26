import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { voidProductionExecutionInTransaction } from '../execution-void-helper';
import { reverseProductionMovementJournal } from '@/services/accounting/production-movement-reversal';
vi.mock('@/services/accounting/production-movement-reversal', () => ({ reverseProductionMovementJournal: vi.fn() }));
vi.mock('@/lib/core/actor-context', () => ({ getActorUserId: () => 'actor' }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/services/inventory/core-service', () => ({ InventoryCoreService: { deductStock: vi.fn(), incrementStock: vi.fn() } }));
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
        $queryRaw: vi.fn(), auditLog: { findFirst: vi.fn().mockResolvedValue(null) },
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

describe('void source identity contract', () => {
    it('retains the database unique reversal edge in the existing schema', async () => {
        const { readFileSync } = await import('node:fs');
        expect(readFileSync('prisma/schema.prisma', 'utf8')).toMatch(/reversalOfId\s+String\?\s+@unique/);
    });
});
