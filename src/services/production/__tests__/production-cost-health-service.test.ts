import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';

const { tx, available, basis } = vi.hoisted(() => ({
    tx: {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(),
        productionOrder: { findMany: vi.fn() },
        stockMovement: { groupBy: vi.fn() },
    },
    available: vi.fn(),
    basis: vi.fn(),
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: { $transaction: vi.fn((fn: (inner: typeof tx) => unknown) => fn(tx)) },
}));
vi.mock('@/services/accounting/production-wip-provenance', () => ({ availableProductionWip: available }));
vi.mock('@/services/inventory/internal-usage-accounting', () => ({ skuInventoryBasis: basis }));

import { prisma } from '@/lib/core/prisma';
import { checkProductionCostHealth, summarizeProductionCostHealth } from '../production-cost-health-service';

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const NOW = new Date('2026-10-28T20:30:00Z');

describe('checkProductionCostHealth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tx.productionOrder.findMany.mockResolvedValue([]);
        tx.$queryRaw.mockResolvedValue([]);
        tx.stockMovement.groupBy.mockResolvedValue([]);
    });

    it('reports a clean tenant from one read-only transaction without locks', async () => {
        tx.productionOrder.findMany.mockResolvedValue([{ id: 'wo', orderNumber: 'WO-1', status: 'IN_PROGRESS' }]);
        available.mockResolvedValue(d(0));
        const health = await checkProductionCostHealth(NOW);
        expect(health.findings).toBe(0);
        expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
        expect(available).toHaveBeenCalledWith(tx, 'wo', { lock: false });
        expect(vi.mocked(prisma.$transaction).mock.calls[0][1]).toMatchObject({ isolationLevel: 'RepeatableRead' });
        expect(summarizeProductionCostHealth('acme', health)).toBe('[ProductionCostHealth] acme: ok');
    });

    it('collects blocked orders, completed residual, legacy affal, uncosted movements and ATK without basis', async () => {
        tx.productionOrder.findMany.mockResolvedValue([
            { id: 'a', orderNumber: 'WO-A', status: 'IN_PROGRESS' },
            { id: 'b', orderNumber: 'WO-B', status: 'COMPLETED' },
            { id: 'c', orderNumber: 'WO-C', status: 'IN_PROGRESS' },
            { id: 'd', orderNumber: 'WO-D', status: 'COMPLETED' },
            { id: 'e', orderNumber: 'WO-E', status: 'COMPLETED' },
        ]);
        available.mockImplementation(async (_tx: unknown, id: string) => {
            if (id === 'a' || id === 'd') throw new BusinessRuleError('Hasil belum disimpan.', { reason: 'jumlah jurnal sumber bukan satu' }, 'PRODUCTION_WIP_UNRESOLVED');
            if (id === 'e') return d('0.49'); // legacy cent rounding, not a finding
            return id === 'b' ? d('5308.22') : d('12.5'); // an active residual is normal between batches
        });
        tx.$queryRaw
            .mockResolvedValueOnce([{ orderNumber: 'WO-C' }])
            .mockResolvedValueOnce([{ id: 'v1', skuCode: 'ATK-1', stockValue: d(40000) }, { id: 'v2', skuCode: 'ATK-2', stockValue: d(0) }]);
        tx.stockMovement.groupBy.mockResolvedValue([{ type: 'IN', _count: { _all: 2 } }]);
        basis.mockImplementation(async (_tx: unknown, id: string) => new Map(id === 'v1' ? [['acc', d(32000)]] : []));

        const health = await checkProductionCostHealth(NOW);

        expect(health).toMatchObject({
            blockedOrders: [{ orderNumber: 'WO-A', reason: 'jumlah jurnal sumber bukan satu' }],
            completedResidual: [{ orderNumber: 'WO-B', residual: '5308.22' }],
            nullCostScrapOrders: ['WO-C'],
            uncostedMovements: [{ type: 'IN', count: 2 }],
            operationalWithoutBasis: [
                { skuCode: 'ATK-1', stockValue: '40000.00', basis: '32000.00' },
                { skuCode: 'ATK-2', stockValue: '0.00', basis: '0.00' },
            ],
            findings: 7,
        });
        expect(tx.stockMovement.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
            type: { in: ['IN', 'OUT'] }, cost: null, createdAt: { gte: new Date('2026-10-27T20:30:00Z') } }) }));
        const line = summarizeProductionCostHealth('acme', health);
        expect(line).toContain('[ProductionCostHealth] check failed for acme: 7 temuan');
        expect(line).toContain('WO-A: jumlah jurnal sumber bukan satu');
        expect(line).toContain('WO-B Rp5308.22');
        expect(line).toContain('ATK-1, ATK-2');
    });

    it('does not hide an unexpected failure as a finding', async () => {
        tx.productionOrder.findMany.mockResolvedValue([{ id: 'a', orderNumber: 'WO-A', status: 'IN_PROGRESS' }]);
        available.mockRejectedValue(new Error('connection lost'));
        await expect(checkProductionCostHealth(NOW)).rejects.toThrow('connection lost');
    });
});
