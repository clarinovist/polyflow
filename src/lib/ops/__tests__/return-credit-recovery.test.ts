import { describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { parseRecoveryArgs } from '../../../../scripts/recover-return-credit';
import { recoverReturnCredit } from '../return-credit-recovery';
import { effectiveReturnCreditWhere, hasActiveRecovery } from '@/lib/finance/effective-return-credit';

const input = { creditId: 'credit', kind: 'REINSTATE' as const, postingDate: '2026-09-20', actorId: 'actor', reason: 'Verified recovery', evidence: 'Synthetic invoice receipt' };
const D = (n: number) => new Prisma.Decimal(n);
function fixture() {
    const credit = { id: 'credit', totalAmount: D(222), netAmount: D(200), taxAmount: D(22), salesReturn: { returnNumber: 'SR-TEST', salesOrder: { orderNumber: 'SO-TEST' } }, recoveries: [], allocations: [{ invoiceId: 'invoice', totalAmount: D(222) }] };
    const query = vi.fn().mockResolvedValueOnce([{ database: 'synthetic', fingerprint: 'fingerprint' }]).mockResolvedValue([{ id: 'event' }]);
    const tx = { $executeRaw: vi.fn(), $queryRaw: query, salesReturnCredit: { findUniqueOrThrow: vi.fn().mockResolvedValue(credit) }, invoice: { findMany: vi.fn().mockResolvedValue([{ id: 'invoice', invoiceNumber: 'INV-TEST', status: 'UNPAID', totalAmount: D(1110), paidAmount: D(0), creditedAmount: D(0), remainingAmount: D(1110) }]) } };
    const transaction = vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
    return { db: { $transaction: transaction } as unknown as PrismaClient, tx, credit, query };
}
describe('return credit recovery operational boundary', () => {
    it('uses read-only validation and displays the exact projected allocation', async () => {
        const f = fixture(); const result = await recoverReturnCredit(f.db, input);
        expect(result).toMatchObject({ mode: 'DRY_RUN', fingerprint: 'fingerprint', eventId: null, invoices: [{ remaining: '1110.00', projectedRemaining: '888.00' }] });
        expect(f.tx.$executeRaw).toHaveBeenCalledTimes(1);
        expect(String(f.query.mock.calls[1][0])).toContain('validate_return_recovery');
    });
    it('executes only with a reviewed fingerprint through the single SQL primitive', async () => {
        const f = fixture(); await expect(recoverReturnCredit(f.db, input, true)).rejects.toThrow('fingerprint');
        const g = fixture(); expect((await recoverReturnCredit(g.db, { ...input, expectedFingerprint: 'fingerprint' }, true)).eventId).toBe('event');
        expect(g.tx.$executeRaw).not.toHaveBeenCalled();
        expect(String(g.query.mock.calls[1][0])).toContain('post_return_credit_recovery');
    });
    it.each([{ postingDate: '2026-02-30' }, { postingDate: 'bad' }, { creditId: '' }, { reason: 'bad' }, { evidence: '' }, { actorId: '' }])('rejects invalid instructions before DB access %j', async patch => {
        const f = fixture(); await expect(recoverReturnCredit(f.db, { ...input, ...patch })).rejects.toThrow();
        expect(f.db.$transaction).not.toHaveBeenCalled();
    });
    it('parses explicit target and requires execute confirmation', () => {
        const args = ['--tenant=synthetic', '--database=synthetic_db', '--credit-id=credit', '--kind=REINSTATE', '--date=2026-09-20', '--actor-id=actor', '--reason=Verified recovery', '--evidence=Synthetic invoice receipt'];
        expect(parseRecoveryArgs(args)).toMatchObject({ execute: false, tenant: 'synthetic', input });
        expect(() => parseRecoveryArgs([...args, '--execute'])).toThrow('--yes');
        expect(() => parseRecoveryArgs([...args, '--execute', '--yes'])).toThrow('fingerprint');
        expect(parseRecoveryArgs([...args, '--execute', '--yes', '--fingerprint=test'])).toMatchObject({ execute: true });
        expect(() => parseRecoveryArgs([...args, '--kind=COMPENSATE'])).toThrow('Exactly one');
    });
    it('distinguishes original reversed history from effective recovery', () => {
        expect(hasActiveRecovery()).toBe(false);
        expect(hasActiveRecovery([{ kind: 'REINSTATE' }])).toBe(true);
        expect(hasActiveRecovery([{ kind: 'REINSTATE' }, { kind: 'COMPENSATE' }])).toBe(false);
        expect(effectiveReturnCreditWhere).toMatchObject({ OR: [{ status: 'POSTED' }, { status: 'REVERSED', AND: [{ recoveries: { some: { kind: 'REINSTATE' } } }, { recoveries: { none: { kind: 'COMPENSATE' } } }] }] });
    });
});
