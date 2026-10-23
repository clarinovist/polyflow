import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { actor, createReturn, date, resetReturnFixture, returnTestClient } from './return-credit-postgres-fixture';
vi.mock('@/services/accounting/account-resolver', () => ({ resolveAccount: async (role: string) => ({ id: role === 'sales-return' ? 'return' : role === 'vat-output' ? 'vat' : 'ar' }) }));
import { postReturnCreditInTransaction } from '../sales-return-credit-service';
import { postManualReturnCreditInTransaction } from '../manual-return-credit-service';
import { reverseReturnCreditInTransaction } from '../sales-return-credit-reversal-service';
import { recoverReturnCredit } from '@/lib/ops/return-credit-recovery';
import { tenantContext } from '@/lib/core/prisma';
import { RekapDagangService } from '../rekap-dagang-service';
import { getFinanceReturnDetail, getFinanceReturnSummary } from '../sales-return-query-service';
import { effectiveReturnCreditWhere } from '@/lib/finance/effective-return-credit';

const db = process.env.RETURN_CREDIT_TEST_DATABASE_URL ? returnTestClient(process.env.RETURN_CREDIT_TEST_DATABASE_URL) : null;
const request = (creditId: string, kind: 'REINSTATE' | 'COMPENSATE' = 'REINSTATE', postingDate = '2026-09-20') => ({ creditId, kind, postingDate, actorId: actor, reason: 'Verified full original credit recovery', evidence: 'Synthetic original invoice and received return' });
const post = (returnId = 'return-1') => db!.$transaction(tx => postReturnCreditInTransaction(tx, { returnId, invoiceId: 'invoice', postingDate: date, lines: [{ returnItemId: `${returnId}-item`, basisLineId: 'basis' }] }, actor));
const reverse = (returnId = 'return-1') => db!.$transaction(tx => reverseReturnCreditInTransaction(tx, { returnId, reversalDate: new Date('2026-09-19T00:00:00+07:00'), reason: 'Synthetic original reversal' }, actor));
async function recover(creditId: string, kind: 'REINSTATE' | 'COMPENSATE' = 'REINSTATE', postingDate = '2026-09-20') {
    const input = request(creditId, kind, postingDate);
    const preview = await recoverReturnCredit(db!, input);
    return recoverReturnCredit(db!, { ...input, expectedFingerprint: preview.fingerprint }, true);
}
async function history() {
    return JSON.stringify({
        credits: await db!.salesReturnCredit.findMany({ orderBy: { id: 'asc' } }),
        allocations: await db!.salesReturnCreditAllocation.findMany({ orderBy: { id: 'asc' } }),
        receipts: await db!.salesReturnReceiptLine.findMany({ orderBy: { id: 'asc' } }),
        movements: await db!.stockMovement.findMany({ orderBy: { id: 'asc' } }),
    });
}

describe.skipIf(!db)('exact return recovery on disposable PostgreSQL', () => {
    beforeEach(async () => { await resetReturnFixture(db!); });
    afterAll(async () => { await db?.$disconnect(); });
    it('recovers manual 222 plus snapshot 888 without rewriting history or creating stock/payment', async () => {
        const first = await db!.$transaction(tx => postManualReturnCreditInTransaction(tx, { returnId: 'return-1', invoiceId: 'invoice', postingDate: date, totalAmount: '222', taxAmount: '22', expectedRemaining: '1110', confirmed: true, reason: 'Synthetic Finance approval', evidence: 'Original invoice and receipt' }, actor));
        await reverse();
        await createReturn(db!, 'return-2', 8);
        const second = await post('return-2'); await reverse('return-2');
        const before = await history();
        const firstResult = await recover(first.id);
        expect(firstResult.invoices[0].remaining).toBe('888.00');
        const result = await recover(second.id);
        expect(result.invoices[0]).toMatchObject({ status: 'PAID', total: '1110.00', paid: '0.00', credited: '1110.00', remaining: '0.00' });
        expect(await history()).toBe(before);
        expect(await db!.payment.count()).toBe(0);
        expect(await db!.returnCreditRecovery.count()).toBe(2);
        expect(await db!.auditLog.count({ where: { action: 'RETURN_CREDIT_REINSTATE' } })).toBe(2);
        expect(await db!.salesReturnCredit.count({ where: effectiveReturnCreditWhere })).toBe(2);
        const [ledger] = await db!.$queryRaw<{ value: Prisma.Decimal }[]>`SELECT invoice_total_return_credit('invoice') value`;
        expect(String(ledger.value)).toBe('1110');
        await tenantContext.run(db!, async () => {
            expect((await getFinanceReturnDetail('return-1'))?.credit).toMatchObject({ status: 'REVERSED', recoveryActive: true });
            expect((await getFinanceReturnSummary()).receivedCount).toBe(0);
            expect((await RekapDagangService.getPiutangRecap({ from: '2026-09-18', to: '2026-09-18' })).totals.closingBalance).toBe(0);
            expect((await RekapDagangService.getPiutangRecap({ from: '2026-09-19', to: '2026-09-19' })).totals.closingBalance).toBe(1110);
            expect((await RekapDagangService.getPiutangRecap({ from: '2026-09-20', to: '2026-09-20' })).totals.closingBalance).toBe(0);
        });
    });
    it('supports identical retry, detects conflicts, compensates once and never reinstates twice', async () => {
        const original = await post(); await reverse();
        const input = request(original.id);
        const preview = await recoverReturnCredit(db!, input);
        const results = await Promise.all([1, 2].map(() => recoverReturnCredit(db!, { ...input, expectedFingerprint: preview.fingerprint }, true)));
        expect(results[0].eventId).toBe(results[1].eventId);
        await expect(recoverReturnCredit(db!, { ...input, reason: 'Changed instruction', expectedFingerprint: preview.fingerprint }, true)).rejects.toThrow();
        await recover(original.id, 'COMPENSATE', '2026-09-21');
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).remainingAmount.toString()).toBe('1110');
        const replay = await recoverReturnCredit(db!, { ...input, expectedFingerprint: preview.fingerprint }, true);
        expect(replay.eventId).toBe(results[0].eventId);
        expect(replay.invoices[0].remaining).toBe('1110.00');
        expect(await db!.returnCreditRecovery.count()).toBe(2);
        expect(await db!.salesReturnCredit.count({ where: effectiveReturnCreditWhere })).toBe(0);
        await expect(db!.returnCreditRecovery.deleteMany()).rejects.toThrow();
        await expect(db!.returnCreditRecovery.updateMany({ data: { reason: 'Rewrite forbidden' } })).rejects.toThrow();
        const event = await db!.returnCreditRecovery.findFirstOrThrow();
        await expect(db!.journalEntry.update({ where: { id: event.journalId }, data: { status: 'VOIDED' } })).rejects.toThrow();
        await expect(db!.journalLine.create({ data: { journalEntryId: event.journalId, accountId: 'ar', debit: 0, credit: 0 } })).rejects.toThrow();
        await expect(db!.invoice.update({ where: { id: 'invoice' }, data: { creditedAmount: 1 } })).rejects.toThrow();
    });
    it('rejects missing receipt, wrong actor, closed period, future date and nonreversed source', async () => {
        const original = await post();
        await expect(recover(original.id)).rejects.toThrow();
        await reverse();
        await expect(recoverReturnCredit(db!, { ...request(original.id), actorId: 'absent' })).rejects.toThrow();
        await expect(recover(original.id, 'REINSTATE', '2099-01-01')).rejects.toThrow();
        await db!.fiscalPeriod.updateMany({ data: { status: 'CLOSED' } });
        await expect(recover(original.id)).rejects.toThrow();
        await resetReturnFixture(db!, false);
        const manual = await db!.$transaction(tx => postManualReturnCreditInTransaction(tx, { returnId: 'return-1', invoiceId: 'invoice', postingDate: date, totalAmount: '222', taxAmount: '22', expectedRemaining: '1110', confirmed: true, reason: 'Synthetic Finance approval', evidence: 'Original legacy invoice' }, actor));
        await reverse();
        await expect(recover(manual.id)).rejects.toThrow();
    });
    it('rejects stale preview and insufficient current balance rather than shrinking recovery', async () => {
        const original = await post(); await reverse();
        const input = request(original.id); const preview = await recoverReturnCredit(db!, input);
        await db!.invoice.update({ where: { id: 'invoice' }, data: { paidAmount: 1000, status: 'PARTIAL' } });
        await expect(recoverReturnCredit(db!, { ...input, expectedFingerprint: preview.fingerprint }, true)).rejects.toThrow();
        await expect(recover(original.id)).rejects.toThrow();
        expect(await db!.returnCreditRecovery.count()).toBe(0);
    });
    it('counts reinstated quantities and cents for later credits and rejects exhausted recovery', async () => {
        await resetReturnFixture(db!, true, 8);
        const first = await post(); await reverse();
        await createReturn(db!, 'return-2', 4); await post('return-2');
        await expect(recover(first.id)).rejects.toThrow();
        await reverse('return-2'); await recover(first.id);
        await createReturn(db!, 'return-3', 4);
        await expect(post('return-3')).rejects.toThrow();
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).creditedAmount.toString()).toBe('888');
    });
    it('rolls back journal/event/cache when audit insertion fails', async () => {
        const original = await post(); await reverse();
        const input = request(original.id); const preview = await recoverReturnCredit(db!, input);
        const journals = await db!.journalEntry.count();
        await expect(db!.$transaction(async tx => {
            await tx.$executeRawUnsafe("CREATE FUNCTION fail_recovery_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$");
            await tx.$executeRawUnsafe('CREATE TRIGGER fail_recovery_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fail_recovery_audit()');
            await tx.$queryRaw`SELECT post_return_credit_recovery(${original.id},'REINSTATE',${new Date('2026-09-20T00:00:00+07:00')}::timestamp,${actor},${input.reason},${input.evidence},${preview.fingerprint})`;
        })).rejects.toThrow();
        expect(await db!.journalEntry.count()).toBe(journals);
        expect(await db!.returnCreditRecovery.count()).toBe(0);
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).creditedAmount.toString()).toBe('0');
    });
    it('migration extends populated history without changing the original immutable records', async () => {
        const original = await post(); await reverse(); const before = await history();
        // Validate preservation contracts of the installed additive migration on populated data.
        const [guards] = await db!.$queryRaw<{ original: string; dateGuard: string }[]>`SELECT pg_get_functiondef('guard_return_credit_history()'::regprocedure) original,pg_get_functiondef('guard_consumed_return_source()'::regprocedure) "dateGuard"`;
        expect(guards.original).toContain('Posted return credit history is immutable');
        expect(guards.dateGuard).toContain('InvoiceDateCorrection');
        expect(readFileSync('prisma/migrations/20261023_return_credit_recovery/migration.sql', 'utf8')).not.toMatch(/DISABLE TRIGGER|session_replication_role|DELETE FROM "SalesReturnCredit"/);
        await recover(original.id); expect(await history()).toBe(before);
    });
});
