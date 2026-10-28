import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { applyProductionCostRecovery, inspectProductionCostRecovery, recoveryFingerprint } from '../cost-recovery-service';
import { BusinessRuleError } from '@/lib/errors/errors';

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), normalize: vi.fn(), wip: vi.fn() }));
vi.mock('@/lib/ops/absorbed-scrap-normalization', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/ops/absorbed-scrap-normalization')>(),
    inspectAbsorbedScrap: mocks.inspect, normalizeAbsorbedScrapInTransaction: mocks.normalize,
}));
vi.mock('@/services/accounting/production-wip-provenance', () => ({ availableProductionWip: mocks.wip }));
const d = (n: number) => new Prisma.Decimal(n);
function fixture() {
    const order = { id: 'wo', orderNumber: 'WO-SYNTHETIC', actualQuantity: d(10), bom: { productVariant: { primaryUnit: 'KG' } } };
    const scrap = { id: 'scrap', productVariantId: 'leaf', toLocationId: 'store', quantity: d(2), cost: null as Prisma.Decimal | null, companyOwned: null as boolean | null, productionExecutionId: null as string | null };
    const inventory = { id: 'inventory', productVariantId: 'leaf', locationId: 'store', quantity: d(2), averageCost: d(0) };
    const state = { movements: [scrap], inventories: [inventory], audit: null as null | { id: string; changes: Record<string, unknown> }, executions: [{ quantityProduced: d(10) }] };
    const tx = {
        $executeRaw: vi.fn(), $queryRaw: vi.fn().mockResolvedValue([{ name: 'synthetic_test' }]),
        user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'FINANCE', roles: [] }) },
        productionOrder: { findUnique: vi.fn().mockResolvedValue(order) },
        productionExecution: { findMany: vi.fn(async () => state.executions), count: vi.fn(async () => state.executions.length) },
        stockMovement: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn(async () => state.movements) },
        inventory: { findMany: vi.fn(async () => state.inventories) },
        journalEntry: { findMany: vi.fn().mockResolvedValue([]) },
        auditLog: { findUnique: vi.fn(async ({ where }) => where.dedupeKey.startsWith('START_PRODUCTION_COST_PERIOD:') ? null : state.audit), findUniqueOrThrow: vi.fn(async () => state.audit), update: vi.fn() },
    };
    mocks.inspect.mockResolvedValue({ order, scraps: [scrap], scrapOwner: new Map([['scrap', 'execution']]), absorbedValue: d(140), fingerprint: 'base' });
    mocks.wip.mockResolvedValue(d(0));
    mocks.normalize.mockImplementation(async () => {
        state.movements = state.movements.map(m => ({ ...m, cost: d(0), companyOwned: true, productionExecutionId: 'execution' })) as typeof state.movements;
        state.audit = { id: 'audit', changes: { originalMovements: [scrap] } };
        return { changed: true, auditId: 'audit' };
    });
    const db = { $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) } as unknown as PrismaClient;
    const backup = { ready: vi.fn(() => true), save: vi.fn(async () => 'verified-private-backup') };
    const inspect = () => inspectProductionCostRecovery(db, 'wo', backup.ready());
    const apply = (fingerprint: string) => applyProductionCostRecovery(db, { orderId: 'wo', fingerprint, reason: 'Synthetic reviewed correction', actorId: 'finance' }, backup);
    return { state, tx, db, backup, inspect, apply };
}

describe('web production cost recovery boundaries', () => {
    beforeEach(() => vi.resetAllMocks());
    it('previews without mutation and only applies the identical backed-up proposal', async () => {
        const f = fixture(); const preview = await f.inspect();
        expect(preview).toMatchObject({ status: 'eligible', savedQuantity: '10', proposal: { absorbedValue: '140' } });
        expect(mocks.normalize).not.toHaveBeenCalled(); expect(f.backup.save).not.toHaveBeenCalled();
        const result = await f.apply(preview.proposal!.fingerprint);
        expect(result).toEqual({ auditId: 'audit', alreadyApplied: false });
        expect(f.backup.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.normalize.mock.invocationCallOrder[0]);
        expect(f.tx.auditLog.update).toHaveBeenCalledWith(expect.objectContaining({ data: { changes: expect.objectContaining({ webVersion: 'metadata-only-v1', webFingerprint: preview.proposal!.fingerprint, postconditionsVerified: true }) } }));
    });
    it('does not present multi-output residual as repairable', async () => {
        const f = fixture(); f.state.executions.push({ quantityProduced: d(20) });
        mocks.wip.mockRejectedValue(new BusinessRuleError('blocked', { reason: 'jumlah jurnal sumber bukan satu' }, 'PRODUCTION_WIP_UNRESOLVED'));
        expect(await f.inspect()).toMatchObject({ status: 'unsupported', savedQuantity: '30', proposal: null, wip: { valid: false, remaining: null } });
        expect(mocks.inspect).not.toHaveBeenCalled();
    });
    it.each(['other history', 'unknown opening', 'null valuation'])('blocks %s even with current zero pool', async kind => {
        const f = fixture();
        if (kind === 'other history') f.state.movements.push({ ...f.state.movements[0], id: 'past-use' });
        if (kind === 'unknown opening') f.state.inventories[0].quantity = d(20);
        if (kind === 'null valuation') f.state.inventories[0].averageCost = null as never;
        expect(await f.inspect()).toMatchObject({ status: 'needs_review', proposal: null });
        expect(mocks.normalize).not.toHaveBeenCalled();
    });
    it('rejects stale preview and missing/failed backup before mutation', async () => {
        const f = fixture(); const preview = await f.inspect();
        await expect(f.apply('f'.repeat(64))).rejects.toThrow('Data berubah');
        f.backup.ready.mockReturnValue(false);
        await expect(f.apply(preview.proposal!.fingerprint)).rejects.toThrow('Cadangan');
        f.backup.ready.mockReturnValue(true); f.backup.save.mockRejectedValue(new Error('storage failed'));
        await expect(f.apply(preview.proposal!.fingerprint)).rejects.toThrow('storage failed');
        expect(mocks.normalize).not.toHaveBeenCalled();
    });
    it('rejects failed in-transaction postconditions', async () => {
        const f = fixture(); const preview = await f.inspect();
        mocks.wip.mockResolvedValue(d(1));
        await expect(f.apply(preview.proposal!.fingerprint)).rejects.toThrow('Verifikasi');
        expect(f.tx.auditLog.update).not.toHaveBeenCalled(); // Real rollback proved by PG contract.
    });
    it('resolves identical replay without backup/mutation but rejects a different request', async () => {
        const f = fixture(); f.state.audit = { id: 'audit', changes: { webVersion: 'metadata-only-v1', webFingerprint: 'a'.repeat(64) } };
        expect(await f.apply('a'.repeat(64))).toEqual({ auditId: 'audit', alreadyApplied: true });
        await expect(f.apply('b'.repeat(64))).rejects.toThrow('Koreksi lain');
        expect(f.backup.save).not.toHaveBeenCalled(); expect(mocks.normalize).not.toHaveBeenCalled();
        expect(await f.inspect()).toMatchObject({ status: 'already_applied', previousAuditId: 'audit', proposal: null });
    });
    it.each([null, { isActive: false, role: 'FINANCE', roles: [] }, { isActive: true, role: 'WAREHOUSE', roles: [] }])('rejects inactive/missing/unauthorized actors even on replay', async actor => {
        const f = fixture(); f.tx.user.findUnique.mockResolvedValue(actor as never);
        f.state.audit = { id: 'audit', changes: { webVersion: 'metadata-only-v1', webFingerprint: 'a'.repeat(64) } };
        await expect(f.apply('a'.repeat(64))).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
        expect(f.backup.save).not.toHaveBeenCalled();
    });
    it('bounds interactive history and never reports partial financial values', async () => {
        const f = fixture(); f.tx.productionExecution.count.mockResolvedValue(501);
        await expect(f.inspect()).rejects.toThrow('batas pemeriksaan');
        expect(mocks.wip).not.toHaveBeenCalled();
    });
    it('does not hide infrastructure failure as an unsupported case', async () => {
        const f = fixture(); mocks.inspect.mockRejectedValue(new Error('connection lost'));
        await expect(f.inspect()).rejects.toThrow('connection lost');
    });
    it('canonicalizes object keys while preserving array order', () => {
        expect(recoveryFingerprint({ b: 1, a: 2 })).toBe(recoveryFingerprint({ a: 2, b: 1 }));
        expect(recoveryFingerprint([1, 2])).not.toBe(recoveryFingerprint([2, 1]));
    });
});
