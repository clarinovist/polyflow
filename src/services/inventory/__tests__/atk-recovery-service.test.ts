import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { applyAtkRecovery, previewAtkRecovery, getAtkRecoveryReceipt } from '../atk-recovery-service';
import { d, proofFixture, fixtureDate } from './atk-recovery-fixture';
import type { AtkRecoveryApply } from '@/types/atk-recovery';
const m = vi.hoisted(() => ({ basis: vi.fn(), journal: vi.fn(), audit: vi.fn() }));
vi.mock('../internal-usage-accounting', () => ({ skuInventoryBasis: m.basis }));
vi.mock('@/services/accounting/journal-posting', () => ({ createJournalEntry: m.journal }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: m.audit }));
function fixture() {
    const f = proofFixture();
    const stock = { ...f.stock, id: 'stock', location: { id: 'office', locationType: 'INTERNAL', packagingOwnerCustomerId: null } };
    const variant = { id: 'sku', archivedAt: null, product: { productType: 'OPERATIONAL' } };
    const corrections: Array<Record<string, unknown>> = [];
    const tx = {
        $executeRaw: vi.fn(), $queryRaw: vi.fn().mockResolvedValue([{ count: BigInt(0) }]),
        stockMovement: { findUnique: vi.fn().mockResolvedValue({ ...f.moves[1], productVariantId: 'sku' }), findMany: vi.fn().mockResolvedValue(f.moves) },
        purchasePriceCorrection: { findFirst: vi.fn().mockResolvedValue(null) },
        productVariant: { findUnique: vi.fn().mockResolvedValue(variant) }, inventory: { findMany: vi.fn().mockResolvedValue([stock]) },
        journalEntry: { findMany: vi.fn().mockResolvedValue(f.journals.map(j => ({ ...j, lines: j.lines.map(l => ({ ...l, account: { ...l.account, code: l.accountId } })) }))) },
        journalLine: { aggregate: vi.fn().mockImplementation(async () => ({ _sum: { debit: d(corrections.length ? 1000 : 980), credit: d(0) } })) },
        fiscalPeriod: { findUnique: vi.fn().mockResolvedValue({ id: 'period', status: 'OPEN' }) },
        user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'FINANCE', roles: [] }) },
        atkCostCorrection: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { corrections.push(data); return data; }) },
    };
    const transaction = vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));
    const db = { ...tx, $transaction: transaction } as unknown as PrismaClient;
    const backup = { ready: vi.fn().mockReturnValue(true), save: vi.fn().mockResolvedValue('private-backup#sha256=verified') };
    m.basis.mockImplementation(async () => new Map([['inv', d(corrections.length ? 1000 : 980)]]));
    return { f, tx, db, transaction, backup, corrections };
}
async function intent(f: ReturnType<typeof fixture>): Promise<AtkRecoveryApply> {
    const preview = await previewAtkRecovery(f.db, { sourceMovementId: 'loss', kind: 'REFUND' }, f.backup);
    expect(preview.status).toBe('eligible');
    return { sourceMovementId: 'loss', kind: 'REFUND', requestId: '11111111-1111-4111-8111-111111111111', fingerprint: preview.proposal!.fingerprint, postingDate: preview.proposal!.postingDate, reason: 'Synthetic source verified', confirmed: true };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(fixtureDate); m.journal.mockResolvedValue({ id: 'new-journal' }); });
afterEach(() => vi.useRealTimers());

describe('ATK recovery transaction orchestration', () => {
    it('previews read-only, saves backup before locks, uses original accounts and verifies exact delta', async () => {
        const f = fixture(); const input = await intent(f);
        expect(f.tx.$executeRaw.mock.calls[0][0].join('')).toContain('READ ONLY');
        expect(f.backup.save).not.toHaveBeenCalled();
        const result = await applyAtkRecovery(f.db, input, 'actor', f.backup);
        expect(result).toMatchObject({ amount: '20.00', alreadyApplied: false, journalId: 'new-journal' });
        const lock = f.tx.$executeRaw.mock.calls.findIndex(c => c[0].join('').includes('LOCK TABLE'));
        expect(f.backup.save.mock.invocationCallOrder[0]).toBeLessThan(f.tx.$executeRaw.mock.invocationCallOrder[lock]);
        expect(f.tx.$executeRaw.mock.calls[lock][0].join('')).toContain('ACCESS EXCLUSIVE MODE NOWAIT');
        for (const table of ['PurchaseOrder', 'GoodsReceipt', 'PurchasePriceCorrection']) {
            expect(f.tx.$executeRaw.mock.calls[lock][0].join('')).toContain(`"${table}"`);
        }
        expect(f.tx.purchasePriceCorrection.findFirst).toHaveBeenCalledTimes(3);
        expect(f.tx.$executeRaw.mock.invocationCallOrder[lock]).toBeLessThan(f.tx.purchasePriceCorrection.findFirst.mock.invocationCallOrder[2]);
        expect(m.journal).toHaveBeenCalledWith(expect.objectContaining({ referenceType: 'STOCK_ADJUSTMENT', lines: [{ accountId: 'inv', debit: 20, credit: 0 }, { accountId: 'loss', debit: 0, credit: 20 }] }), f.tx);
        expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ATK_COST_REFUND', tx: f.tx }));
        expect(JSON.stringify(result)).not.toContain('private-backup');
    });
    it('blocks corrected purchase evidence before proof or backup, including a later receipt in the history', async () => {
        const f = fixture(); const request = await intent(f);
        f.f.moves.push({ ...f.f.moves[0], id: 'purchase-2' });
        f.tx.purchasePriceCorrection.findFirst.mockResolvedValue({ id: 'price-correction' });
        f.tx.journalEntry.findMany.mockClear();
        expect(await previewAtkRecovery(f.db, { sourceMovementId: 'loss', kind: 'REFUND' }, f.backup)).toMatchObject({ status: 'blocked', message: expect.stringContaining('koreksi harga') });
        await expect(applyAtkRecovery(f.db, request, 'actor', f.backup)).rejects.toMatchObject({ code: 'PURCHASE_PRICE_CORRECTED' });
        expect(f.tx.purchasePriceCorrection.findFirst).toHaveBeenLastCalledWith({
            where: { purchaseOrder: { goodsReceipts: { some: { movements: { some: { id: { in: ['purchase', 'purchase-2'] } } } } } } },
            select: { id: true },
        });
        expect(f.tx.journalEntry.findMany).not.toHaveBeenCalled();
        expect(f.backup.save).not.toHaveBeenCalled();
        expect(f.tx.atkCostCorrection.create).not.toHaveBeenCalled();
        expect(m.journal).not.toHaveBeenCalled();
        expect(m.audit).not.toHaveBeenCalled();
    });
    it('rechecks corrected purchase evidence under the apply lock after backup', async () => {
        const f = fixture(); const request = await intent(f);
        f.backup.save.mockImplementation(async () => {
            f.tx.purchasePriceCorrection.findFirst.mockResolvedValue({ id: 'price-correction' });
            return 'backup';
        });
        await expect(applyAtkRecovery(f.db, request, 'actor', f.backup)).rejects.toMatchObject({ code: 'PURCHASE_PRICE_CORRECTED' });
        const lock = f.tx.$executeRaw.mock.calls.findIndex(c => c[0].join('').includes('LOCK TABLE'));
        expect(f.tx.$executeRaw.mock.invocationCallOrder[lock]).toBeLessThan(f.tx.purchasePriceCorrection.findFirst.mock.invocationCallOrder[2]);
        expect(f.tx.atkCostCorrection.create).not.toHaveBeenCalled();
        expect(m.journal).not.toHaveBeenCalled();
        expect(m.audit).not.toHaveBeenCalled();
    });
    it('propagates correction lookup failures instead of trusting unverified acquisition costs', async () => {
        const f = fixture();
        f.tx.purchasePriceCorrection.findFirst.mockRejectedValue(new Error('correction lookup unavailable'));
        await expect(previewAtkRecovery(f.db, { sourceMovementId: 'loss', kind: 'REFUND' }, f.backup)).rejects.toThrow('correction lookup unavailable');
        expect(f.tx.atkCostCorrection.create).not.toHaveBeenCalled();
    });
    it('replays identical requests before backup and rejects request key reuse', async () => {
        const f = fixture(); const input = await intent(f); await applyAtkRecovery(f.db, input, 'actor', f.backup);
        f.tx.atkCostCorrection.findUnique.mockResolvedValue(f.corrections[0]); f.backup.save.mockClear();
        expect(await applyAtkRecovery(f.db, input, 'actor', f.backup)).toMatchObject({ alreadyApplied: true });
        expect(await getAtkRecoveryReceipt(f.db, input.requestId)).toMatchObject({ amount: '20.00' });
        expect(f.backup.save).not.toHaveBeenCalled();
        await expect(applyAtkRecovery(f.db, { ...input, reason: 'Different explanation' }, 'actor', f.backup)).rejects.toThrow('berbeda');
    });
    it('rejects stale evidence after backup, backup failure, and unavailable storage before writes', async () => {
        const f = fixture(); const input = await intent(f);
        f.backup.save.mockImplementation(async () => { f.tx.productVariant.findUnique.mockResolvedValue({ id: 'sku', archivedAt: null, name: 'changed', product: { productType: 'OPERATIONAL' } }); return 'backup'; });
        await expect(applyAtkRecovery(f.db, input, 'actor', f.backup)).rejects.toThrow('berubah'); expect(m.journal).not.toHaveBeenCalled();
        const g = fixture(); const next = await intent(g); g.backup.save.mockRejectedValue(new Error('backup failure'));
        await expect(applyAtkRecovery(g.db, next, 'actor', g.backup)).rejects.toThrow('backup failure');
        g.backup.ready.mockReturnValue(false); await expect(applyAtkRecovery(g.db, next, 'actor', g.backup)).rejects.toThrow('belum tersedia');
    });
    it('rejects unauthorized actor, invalid confirmation and old posting date', async () => {
        const f = fixture(); const input = await intent(f); f.tx.user.findUnique.mockResolvedValue({ isActive: true, role: 'WAREHOUSE', roles: [] });
        await expect(applyAtkRecovery(f.db, input, 'actor', f.backup)).rejects.toThrow('Finance');
        await expect(applyAtkRecovery(f.db, { ...input, confirmed: false } as never, 'actor', f.backup)).rejects.toThrow('persetujuan');
        await expect(applyAtkRecovery(f.db, { ...input, postingDate: '2026-01-14' }, 'actor', f.backup)).rejects.toThrow('hari ini');
    });
    it('reports source, custody, closed period and ambiguous journal issues as blocked previews', async () => {
        const f = fixture(); const preview = () => previewAtkRecovery(f.db, { sourceMovementId: 'loss', kind: 'REFUND' }, f.backup);
        f.tx.fiscalPeriod.findUnique.mockResolvedValue({ id: 'period', status: 'CLOSED' }); expect(await preview()).toMatchObject({ status: 'blocked' });
        f.tx.fiscalPeriod.findUnique.mockResolvedValue({ id: 'period', status: 'OPEN' }); f.tx.$queryRaw.mockResolvedValue([{ count: BigInt(1) }]);
        expect(await preview()).toMatchObject({ status: 'blocked', message: expect.stringContaining('atribusi') });
        f.tx.inventory.findMany.mockResolvedValue([]); expect(await preview()).toMatchObject({ status: 'blocked' });
        f.tx.stockMovement.findUnique.mockResolvedValue(null); expect(await preview()).toMatchObject({ status: 'blocked' });
    });
    it('aborts on postcondition/audit failure; real rollback is verified by the PostgreSQL contract', async () => {
        const f = fixture(); const input = await intent(f); m.audit.mockRejectedValue(new Error('audit failure'));
        await expect(applyAtkRecovery(f.db, input, 'actor', f.backup)).rejects.toThrow('audit failure');
        const g = fixture(); const next = await intent(g); m.basis.mockResolvedValue(new Map([['inv', d(980)]]));
        await expect(applyAtkRecovery(g.db, next, 'actor', g.backup)).rejects.toThrow('Verifikasi basis');
    });
    it('previews compensation only with unchanged proof and enough basis/GL, and returns existing receipts', async () => {
        const f = fixture(); const request = await intent(f); await applyAtkRecovery(f.db, request, 'actor', f.backup);
        const refund = { ...f.corrections[0], kind: 'REFUND', amount: d(20), postingDate: fixtureDate, journal: { status: 'POSTED', lines: [] } };
        f.tx.atkCostCorrection.findMany.mockResolvedValue([refund]);
        const preview = () => previewAtkRecovery(f.db, { sourceMovementId: 'loss', kind: 'COMPENSATION' }, f.backup);
        expect(await preview()).toMatchObject({ status: 'eligible', proposal: { kind: 'COMPENSATION', amount: '20.00' } });
        f.tx.journalLine.aggregate.mockResolvedValue({ _sum: { debit: d(0), credit: d(0) } });
        expect(await preview()).toMatchObject({ status: 'blocked', message: expect.stringContaining('saldo GL') });
        f.tx.journalLine.aggregate.mockResolvedValue({ _sum: { debit: d(1000), credit: d(0) } });
        f.tx.productVariant.findUnique.mockResolvedValue({ id: 'sku', name: 'changed', archivedAt: null, product: { productType: 'OPERATIONAL' } });
        expect(await preview()).toMatchObject({ status: 'blocked', message: expect.stringContaining('berubah sejak refund') });
        f.tx.atkCostCorrection.findUnique.mockResolvedValue(refund);
        expect(await previewAtkRecovery(f.db, { sourceMovementId: 'loss', kind: 'REFUND' }, f.backup)).toMatchObject({ status: 'already_applied', receipt: { alreadyApplied: true } });
    });
    it('does not hide unexpected read failures as ineligibility', async () => {
        const f = fixture(); f.tx.stockMovement.findMany.mockRejectedValue(new Error('database unavailable'));
        await expect(previewAtkRecovery(f.db, { sourceMovementId: 'loss', kind: 'REFUND' }, f.backup)).rejects.toThrow('database unavailable');
    });
    it('maps lock contention to a retry instruction without claiming success', async () => {
        const f = fixture(); const input = await intent(f);
        f.tx.$executeRaw.mockImplementation(async (parts: TemplateStringsArray) => { if (parts.join('').includes('LOCK TABLE')) throw new Prisma.PrismaClientKnownRequestError('lock busy', { code: 'P2010', clientVersion: '5', meta: { code: '55P03' } }); });
        await expect(applyAtkRecovery(f.db, input, 'actor', f.backup)).rejects.toThrow('Transaksi lain'); expect(m.journal).not.toHaveBeenCalled();
    });
});
