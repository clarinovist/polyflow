import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';

const { tx, available, basis } = vi.hoisted(() => ({
    tx: {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(),
        productionOrder: { findMany: vi.fn() },
        auditLog: { findUnique: vi.fn().mockResolvedValue(null) },
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
import { checkProductionCostHealth, summarizeProductionCostHealth, type ProductionCostHealth } from '../production-cost-health-service';

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const NOW = new Date('2026-10-28T20:30:00Z');
// Host monitor contract: informational lines must not match, even case-insensitively.
const HOST_ALERT_PATTERN = /error|exception|fatal|panic|failed|numeric field overflow|violates .* constraint|deadlock detected|out of memory|too many connections|could not (connect|serialize|obtain)|\bP\d{4}\b/i;

function retainedCostPeriod(version: 1 | 2 = 1) {
    return {
        action: 'START_PRODUCTION_COST_PERIOD', entityId: 'wo', entityType: 'ProductionOrder',
        changes: {
            version, orderId: 'wo', movementIds: ['m'], executionIds: ['e'],
            sourceHash: 'a'.repeat(64), executionHash: 'b'.repeat(64), fingerprint: 'c'.repeat(64),
            historicalBalances: version === 1
                ? [{ accountId: 'wip', amount: '40.00' }]
                : [{ accountId: 'wip', amount: '50.00' }, { accountId: 'legacy', amount: '-10.00' }],
            ...(version === 2 ? {
                mode: 'REVIEWED_LEGACY_SEAL', materialIssueIds: [], scrapRecordIds: [],
                supportHash: 'd'.repeat(64), nonvoidOutput: '1', netOutput: '1',
                anomalies: [{ category: 'NEGATIVE_ACCOUNT_POOLS_RETAINED', count: 1 }],
            } : {}),
        },
    };
}

describe('checkProductionCostHealth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tx.productionOrder.findMany.mockResolvedValue([]);
        tx.auditLog.findUnique.mockResolvedValue(null);
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
            { id: 'wo', orderNumber: 'WO-HISTORY', status: 'IN_PROGRESS' },
        ]);
        tx.auditLog.findUnique.mockImplementation(async ({ where }: { where: { dedupeKey: string } }) =>
            where.dedupeKey === 'START_PRODUCTION_COST_PERIOD:wo' ? retainedCostPeriod(2) : null);
        available.mockImplementation(async (_tx: unknown, id: string) => {
            if (id === 'a' || id === 'd') throw new BusinessRuleError('Hasil belum disimpan.', { reason: 'jumlah jurnal sumber bukan satu' }, 'PRODUCTION_WIP_UNRESOLVED');
            if (id === 'e') return d('0.49'); // legacy cent rounding, not a finding
            return id === 'b' ? d('5308.22') : d('12.5'); // an active residual is normal between batches
        });
        tx.$queryRaw
            .mockResolvedValueOnce([{ orderNumber: 'WO-C' }])
            .mockResolvedValueOnce([{ orderNumber: 'WO-F', skuCode: 'FG-1', quantity: d('12.5') }])
            .mockResolvedValueOnce([{ id: 'v1', skuCode: 'ATK-1', stockValue: d(40000) }, { id: 'v2', skuCode: 'ATK-2', stockValue: d(0) }]);
        tx.stockMovement.groupBy.mockResolvedValue([{ type: 'IN', _count: { _all: 2 } }]);
        basis.mockImplementation(async (_tx: unknown, id: string) => new Map(id === 'v1' ? [['acc', d(32000)]] : []));

        const health = await checkProductionCostHealth(NOW);

        expect(health).toMatchObject({
            blockedOrders: [{ orderNumber: 'WO-A', reason: 'jumlah jurnal sumber bukan satu' }],
            completedResidual: [{ orderNumber: 'WO-B', residual: '5308.22' }],
            nullCostScrapOrders: ['WO-C'],
            uncostedMovements: [{ type: 'IN', count: 2 }],
            zeroCostOutputs: [{ orderNumber: 'WO-F', skuCode: 'FG-1', quantity: '12.5' }],
            operationalWithoutBasis: [
                { skuCode: 'ATK-1', stockValue: '40000.00', basis: '32000.00' },
                { skuCode: 'ATK-2', stockValue: '0.00', basis: '0.00' },
            ],
            findings: 8,
        });
        expect(tx.stockMovement.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
            type: { in: ['IN', 'OUT'] }, cost: null, createdAt: { gte: new Date('2026-10-27T20:30:00Z') } }) }));
        const line = summarizeProductionCostHealth('acme', health);
        expect(line).toContain('[ProductionCostHealth] check failed for acme: 8 temuan');
        expect(line).toContain('hasil bernilai Rp0 24 jam (WO-F FG-1 12.5)');
        expect(line).toContain('WO-A: jumlah jurnal sumber bukan satu');
        expect(line).toContain('WO-B Rp5308.22');
        expect(line).toContain('ATK-1, ATK-2');
        expect(health.retainedHistory).toHaveLength(1);
        expect(line).toContain('biaya historis dipertahankan, bukan dana hasil baru (WO-HISTORY Rp40.00');
        expect(line).toMatch(HOST_ALERT_PATTERN);
    });

    it('flags a revision that records less affal or material than the voided entry', async () => {
        tx.$queryRaw
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                { orderNumber: 'WO-P', affal: d('9.0000'), revisedAffal: d('0.0000'), materials: [{ skuCode: 'RHK0000', before: 769, after: 760 }] },
                { orderNumber: 'WO-Q', affal: d('0.5'), revisedAffal: d('0.5'), materials: [{ skuCode: 'ETK', before: 760, after: 76 }] },
                // Non-packaged entries link no material movements: affal alone is compared.
                { orderNumber: 'WO-R', affal: d('0.32'), revisedAffal: d('0'), materials: null },
            ]);

        const health = await checkProductionCostHealth(NOW);

        expect(health.revisionShortfalls).toEqual([
            { orderNumber: 'WO-P', changes: ['affal 9 → 0 kg', 'RHK0000 769 → 760'] },
            { orderNumber: 'WO-Q', changes: ['ETK 760 → 76'] },
            { orderNumber: 'WO-R', changes: ['affal 0.32 → 0 kg'] },
        ]);
        expect(health.findings).toBe(3);
        const values = tx.$queryRaw.mock.calls[3].slice(1);
        expect(values).toEqual(expect.arrayContaining([new Date('2026-10-21T20:30:00Z'), new Date('2026-10-27T20:30:00Z')]));
        expect(summarizeProductionCostHealth('acme', health)).toContain(
            '3 revisi SPK mengurangi affal/bahan dari isian yang di-void (WO-P: affal 9 → 0 kg, RHK0000 769 → 760; WO-Q: ETK 760 → 76; WO-R: affal 0.32 → 0 kg)',
        );
    });

    it('lists stock that entered through an adjustment at Rp0 for lack of any cost source', async () => {
        tx.$queryRaw
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ skuCode: 'FG-9', quantity: d('12.5') }]);

        const health = await checkProductionCostHealth(NOW);

        expect(health.zeroCostAdjustments).toEqual([{ skuCode: 'FG-9', quantity: '12.5' }]);
        expect(health.findings).toBe(1);
        expect(tx.$queryRaw.mock.calls[4].slice(1)).toEqual(expect.arrayContaining([new Date('2026-10-27T20:30:00Z')]));
        expect(summarizeProductionCostHealth('acme', health)).toContain('penyesuaian masuk Rp0 tanpa sumber harga 24 jam (FG-9 12.5)');
    });

    it.each([
        { version: 1 as const, status: 'IN_PROGRESS' },
        { version: 2 as const, status: 'IN_PROGRESS' },
        { version: 1 as const, status: 'COMPLETED' },
        { version: 2 as const, status: 'COMPLETED' },
    ])('keeps v$version retained history informational for $status orders', async ({ version, status }) => {
        tx.productionOrder.findMany.mockResolvedValue([{ id: 'wo', orderNumber: 'WO-1', status }]);
        available.mockResolvedValue(d(0));
        const period = retainedCostPeriod(version);
        tx.auditLog.findUnique.mockResolvedValue(period);

        const health = await checkProductionCostHealth(NOW);

        expect(health.retainedHistory).toEqual([{
            orderNumber: 'WO-1', amount: '40.00',
            ...(version === 2 ? { accounts: period.changes.historicalBalances, anomalies: period.changes.anomalies } : {}),
        }]);
        expect(health.findings).toBe(0);
        const line = summarizeProductionCostHealth('acme', health);
        expect(line).toContain('[ProductionCostHealth] acme: ok');
        expect(line).toContain('biaya historis dipertahankan, bukan dana hasil baru (WO-1 Rp40.00');
        if (version === 2) expect(line).toContain('[per akun: 50.00, -10.00; NEGATIVE_ACCOUNT_POOLS_RETAINED:1]');
        expect(line).not.toMatch(HOST_ALERT_PATTERN);
    });
    it('does not hide an unexpected failure as a finding', async () => {
        tx.productionOrder.findMany.mockResolvedValue([{ id: 'a', orderNumber: 'WO-A', status: 'IN_PROGRESS' }]);
        available.mockRejectedValue(new Error('connection lost'));
        await expect(checkProductionCostHealth(NOW)).rejects.toThrow('connection lost');
    });
});

describe('summarizeProductionCostHealth', () => {
    const clean: ProductionCostHealth = {
        blockedOrders: [], completedResidual: [], nullCostScrapOrders: [], uncostedMovements: [],
        zeroCostOutputs: [], operationalWithoutBasis: [], revisionShortfalls: [], zeroCostAdjustments: [],
        findings: 0,
    };
    const retainedHistory = [{ orderNumber: 'WO-HISTORY', amount: '40.00' }];

    it.each([undefined, []])('keeps the clean summary monitor-safe with retainedHistory=%j', (history) => {
        const line = summarizeProductionCostHealth('acme', { ...clean, retainedHistory: history });
        expect(line).toBe('[ProductionCostHealth] acme: ok');
        expect(line).not.toMatch(HOST_ALERT_PATTERN);
    });

    it('includes retained history in an ok line rather than dropping it', () => {
        const line = summarizeProductionCostHealth('acme', { ...clean, retainedHistory });
        expect(line).toBe('[ProductionCostHealth] acme: ok — biaya historis dipertahankan, bukan dana hasil baru (WO-HISTORY Rp40.00)');
        expect(line).not.toMatch(HOST_ALERT_PATTERN);
    });

    it.each<{ label: string; finding: Partial<ProductionCostHealth>; count: number }>([
        { label: 'SPK terblokir', finding: { blockedOrders: [{ orderNumber: 'WO-A', reason: 'sumber belum lengkap' }] }, count: 1 },
        { label: 'SPK selesai bersisa WIP', finding: { completedResidual: [{ orderNumber: 'WO-A', residual: '2.00' }] }, count: 1 },
        { label: 'SPK affal NULL', finding: { nullCostScrapOrders: ['WO-A'] }, count: 1 },
        { label: 'movement produksi tanpa biaya', finding: { uncostedMovements: [{ type: 'IN', count: 2 }] }, count: 2 },
        { label: 'hasil bernilai Rp0', finding: { zeroCostOutputs: [{ orderNumber: 'WO-A', skuCode: 'FG-1', quantity: '1' }] }, count: 1 },
        { label: 'SKU ATK tanpa basis', finding: { operationalWithoutBasis: [{ skuCode: 'ATK-1', stockValue: '2.00', basis: '0.00' }] }, count: 1 },
        { label: 'revisi SPK mengurangi affal/bahan', finding: { revisionShortfalls: [{ orderNumber: 'WO-A', changes: ['affal 1 → 0 kg'] }] }, count: 1 },
        { label: 'penyesuaian masuk Rp0', finding: { zeroCostAdjustments: [{ skuCode: 'FG-1', quantity: '1' }] }, count: 1 },
    ])('still alerts for $label alongside retained history', ({ label, finding, count }) => {
        const line = summarizeProductionCostHealth('acme', { ...clean, ...finding, retainedHistory, findings: count });
        expect(line).toContain(`[ProductionCostHealth] check failed for acme: ${count} temuan`);
        expect(line).toContain(label);
        expect(line).toContain('WO-HISTORY Rp40.00');
        expect(line).toMatch(HOST_ALERT_PATTERN);
    });
});
