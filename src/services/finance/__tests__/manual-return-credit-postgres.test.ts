import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { actor, createReturn, date, resetReturnFixture, returnTestClient } from './return-credit-postgres-fixture';
vi.mock('@/services/accounting/account-resolver', () => ({ resolveAccount: async (role: string) => ({ id: role === 'sales-return' ? 'return' : role === 'vat-output' ? 'vat' : role === 'petty-cash' ? 'cash' : 'ar' }) }));
import { postManualReturnCredit, postManualReturnCreditInTransaction } from '../manual-return-credit-service';
import { tenantContext } from '@/lib/core/prisma';
import { recordCustomerPaymentInTransaction } from '../customer-payment-service';
import { deleteCustomerPaymentInTransaction } from '../customer-payment-delete-service';
import { RekapDagangService } from '../rekap-dagang-service';
vi.mock('@/services/settings/app-settings-service', () => ({ getPaymentBanksSetting: async () => [] }));
import { reverseReturnCreditInTransaction } from '../sales-return-credit-reversal-service';
import { postReturnCreditInTransaction } from '../sales-return-credit-service';
const db = process.env.RETURN_CREDIT_TEST_DATABASE_URL ? returnTestClient(process.env.RETURN_CREDIT_TEST_DATABASE_URL) : null;
const input = { returnId: 'return-1', invoiceId: 'invoice', postingDate: date, totalAmount: '222', taxAmount: '22', expectedRemaining: '1110', reason: 'Finance verified return', evidence: 'Original invoice and signed receipt reference', confirmed: true };
const post = (patch: Partial<typeof input> = {}) => db!.$transaction(tx => postManualReturnCreditInTransaction(tx, { ...input, ...patch }, actor));
describe.skipIf(!db)('manual Finance credit on disposable PostgreSQL', () => {
    beforeEach(async () => {
        await resetReturnFixture(db!, false);
        await db!.invoice.update({ where: { id: 'invoice' }, data: { status: 'DRAFT' } });
        await db!.invoiceReturnBasisLine.deleteMany();
        await db!.invoice.update({ where: { id: 'invoice' }, data: { status: 'UNPAID' } });
    });
    afterAll(async () => { await db?.$disconnect(); });
    it('posts manual approved amount without fabricated snapshot, receipt, payment or stock', async () => {
        const credit = await post();
        expect(credit).toMatchObject({ status: 'POSTED', mode: 'MANUAL', approvedById: actor, approvalReason: input.reason, evidenceReference: input.evidence });
        expect(credit.approvedAt).toBeInstanceOf(Date);
        const invoice = await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } });
        expect(invoice.creditedAmount.toString()).toBe('222');
        expect(invoice.remainingAmount.toString()).toBe('888');
        expect(invoice.totalAmount.toString()).toBe('1110');
        expect(invoice.paidAmount.toString()).toBe('0');
        expect(await db!.invoiceReturnBasisLine.count()).toBe(0);
        expect(await db!.salesReturnReceiptLine.count()).toBe(0);
        expect(await db!.payment.count()).toBe(0);
        expect(await db!.stockMovement.count()).toBe(1);
        expect(await db!.auditLog.count({ where: { action: 'POST_MANUAL_SALES_RETURN_CREDIT' } })).toBe(1);
        const allocation = await db!.salesReturnCreditAllocation.findFirstOrThrow();
        expect(allocation).toMatchObject({ basisLineId: null, returnItemId: null, quantity: null, manualSourceJournalId: 'source-journal' });
        const lines = await db!.journalLine.findMany({ where: { journalEntryId: credit.journalId! } });
        expect(lines.find(line => line.accountId === 'vat')?.debit.toString()).toBe('22');
        expect(lines.find(line => line.accountId === 'return')?.debit.toString()).toBe('200');
    });
    it('retries identically without duplicates and rejects changed/mixed-mode instructions', async () => {
        const results = await Promise.all([post(), post()]);
        expect(results[0].id).toBe(results[1].id);
        await expect(post({ totalAmount: '223' })).rejects.toThrow();
        await expect(db!.$transaction(tx => postReturnCreditInTransaction(tx, { returnId: 'return-1', invoiceId: 'invoice', postingDate: date, lines: [{ returnItemId: 'return-1-item', basisLineId: 'basis' }] }, actor))).rejects.toThrow();
        expect(await db!.salesReturnCreditAllocation.count()).toBe(1);
        expect(await db!.journalEntry.count({ where: { referenceType: 'SALES_RETURN' } })).toBe(1);
    });
    it.each([{ totalAmount: '1111' }, { taxAmount: '111' }, { expectedRemaining: '1109' }, { postingDate: new Date('2099-01-01') }, { postingDate: new Date('2026-08-01') }, { confirmed: false }, { evidence: '' }])('rejects invalid or stale approval %j', async patch => {
        await expect(post(patch)).rejects.toThrow();
        expect(await db!.salesReturnCredit.count()).toBe(0);
    });
    it.each(['DRAFT', 'CONFIRMED', 'CANCELLED'] as const)('rejects operational %s', async status => {
        await db!.salesReturn.update({ where: { id: 'return-1' }, data: { status } });
        await expect(post()).rejects.toThrow();
    });
    it('blocks existing legacy journal, even without snapshot, rather than crediting twice', async () => {
        await db!.journalEntry.create({ data: { entryNumber: 'LEGACY', entryDate: date, description: 'Synthetic legacy', referenceType: 'SALES_RETURN', referenceId: 'return-1', status: 'POSTED' } });
        await expect(post()).rejects.toThrow(/rekonsiliasi/i);
        expect(await db!.salesReturnCredit.count()).toBe(0);
    });
    it('rolls back audit/journal/cache when transaction fails', async () => {
        await expect(db!.$transaction(async tx => { await postManualReturnCreditInTransaction(tx, input, actor); throw Error('injected'); })).rejects.toThrow('injected');
        expect(await db!.salesReturnCredit.count()).toBe(0);
        expect(await db!.auditLog.count()).toBe(0);
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).creditedAmount.toString()).toBe('0');
    });
    it('serializes two manual approvals against fresh invoice balance', async () => {
        await createReturn(db!, 'return-2', 2, false);
        const results = await Promise.allSettled([post({ totalAmount: '700', taxAmount: '0' }), post({ returnId: 'return-2', totalAmount: '700', taxAmount: '0' })]);
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).remainingAmount.toString()).toBe('410');
    });
    it('preserves manual evidence on compensating reversal and cannot silently repost', async () => {
        const posted = await post();
        await db!.$transaction(tx => reverseReturnCreditInTransaction(tx, { returnId: input.returnId, reversalDate: date, reason: 'Synthetic correction' }, actor));
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).remainingAmount.toString()).toBe('1110');
        expect(await db!.salesReturnCredit.findUniqueOrThrow({ where: { id: posted.id } })).toMatchObject({ mode: 'MANUAL', status: 'REVERSED', approvalReason: input.reason });
        await expect(post()).rejects.toThrow();
        expect(await db!.payment.count()).toBe(0);
    });
    it.each(['DRAFT', 'CANCELLED', 'PAID'] as const)('rejects invoice status %s', async status => {
        await db!.invoice.update({ where: { id: 'invoice' }, data: { status } }); await expect(post()).rejects.toThrow();
        expect(await db!.salesReturnCredit.count()).toBe(0);
    });
    it('rejects missing, duplicated, wrong-currency and mismatched source journals', async () => {
        await db!.journalEntry.update({ where: { id: 'source-journal' }, data: { status: 'VOIDED' } }); await expect(post()).rejects.toThrow();
        await db!.journalEntry.update({ where: { id: 'source-journal' }, data: { status: 'POSTED' } });
        await db!.journalEntry.create({ data: { id: 'duplicate', entryNumber: 'DUPLICATE', entryDate: date, description: 'Synthetic', referenceType: 'SALES_INVOICE', referenceId: 'invoice', status: 'POSTED' } });
        await expect(post()).rejects.toThrow(); await db!.journalEntry.delete({ where: { id: 'duplicate' } });
        await db!.journalLine.updateMany({ where: { journalEntryId: 'source-journal' }, data: { currency: 'USD' } }); await expect(post()).rejects.toThrow();
        await db!.journalLine.updateMany({ where: { journalEntryId: 'source-journal' }, data: { currency: 'IDR' } });
        await db!.journalLine.updateMany({ where: { journalEntryId: 'source-journal', accountId: 'ar' }, data: { debit: 999 } }); await expect(post()).rejects.toThrow();
        expect(await db!.salesReturnCredit.count()).toBe(0);
    });
    it('rejects inactive accounts and receipt dates after the requested posting', async () => {
        await db!.account.update({ where: { id: 'return' }, data: { isActive: false } }); await expect(post()).rejects.toThrow();
        await db!.account.update({ where: { id: 'return' }, data: { isActive: true } });
        await db!.salesReturnReceiptLine.create({ data: { returnItemId: 'return-1-item', sourceMovementId: 'credit-source-movement', quantity: 2, restockValue: 0, receivedAt: new Date('2026-09-19T00:00:00+07:00'), createdById: actor } });
        await expect(post()).rejects.toThrow('Tanggal posting');
    });
    it('accepts exact full settlement with tax and explicit zero-tax smaller credits', async () => {
        await post({ totalAmount: '1110', taxAmount: '110' });
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).status).toBe('PAID');
    });
    it('records explicit zero tax and upgrades an existing review without losing actor approval', async () => {
        await db!.salesReturnCredit.create({ data: { salesReturnId: 'return-1', createdById: actor, reviewReason: 'Missing historical basis' } });
        const credit = await post({ totalAmount: '100', taxAmount: '0' });
        expect(credit.reviewReason).toBeNull(); expect(credit.taxAmount.toString()).toBe('0');
        expect(await db!.journalLine.count({ where: { journalEntryId: credit.journalId!, accountId: 'vat' } })).toBe(0);
    });
    it('requires a tenant client and isolates concurrent tenants', async () => {
        await expect(postManualReturnCredit(input, actor)).rejects.toThrow('Konteks tenant');
        const otherUrl = new URL(process.env.RETURN_CREDIT_TEST_DATABASE_URL!); otherUrl.pathname = '/polyflow_return_credit_tenant_test';
        const other = returnTestClient(otherUrl.toString());
        try {
            await resetReturnFixture(other, false);
            await Promise.all([tenantContext.run(db!, () => postManualReturnCredit(input, actor)), tenantContext.run(other, () => postManualReturnCredit({ ...input, totalAmount: '111', taxAmount: '11' }, actor))]);
            expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).creditedAmount.toString()).toBe('222');
            expect((await other.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).creditedAmount.toString()).toBe('111');
        } finally { await other.$disconnect(); }
    });
    it('serializes manual credit against cash payment and preserves credit on payment deletion', async () => {
        await db!.account.create({ data: { id: 'cash', code: '11100', name: 'Synthetic Cash', type: 'ASSET', category: 'CURRENT_ASSET' } });
        const pay = (amount: number) => db!.$transaction(tx => recordCustomerPaymentInTransaction(tx, { invoiceId: 'invoice', amount, paymentDate: date, method: 'Cash' }, 'MANUAL-PAY', actor));
        const results = await Promise.allSettled([post(), pay(1000)]);
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        const balance = await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } });
        expect(balance.remainingAmount.gte(0)).toBe(true);
        if (results[0].status === 'fulfilled') {
            const payment = await pay(888);
            expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).status).toBe('PAID');
            await db!.$transaction(tx => deleteCustomerPaymentInTransaction(tx, payment.id, actor));
            expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).creditedAmount.toString()).toBe('222');
        }
    });
    it('settles remaining cash, deletes cash without credit loss, and includes manual credit in as-of recap', async () => {
        await post();
        const recap = await tenantContext.run(db!, () => RekapDagangService.getPiutangRecap({ from: '2026-09-01', to: '2026-09-30' }));
        expect(recap.rows[0].closingBalance).toBe(888);
        await db!.account.create({ data: { id: 'cash', code: '11100', name: 'Synthetic Cash', type: 'ASSET', category: 'CURRENT_ASSET' } });
        await expect(db!.$transaction(tx => recordCustomerPaymentInTransaction(tx, { invoiceId: 'invoice', amount: 889, paymentDate: date, method: 'Cash' }, 'OVERPAY', actor))).rejects.toThrow();
        const payment = await db!.$transaction(tx => recordCustomerPaymentInTransaction(tx, { invoiceId: 'invoice', amount: 888, paymentDate: date, method: 'Cash' }, 'PAY-REMAINING', actor));
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).status).toBe('PAID');
        await db!.$transaction(tx => deleteCustomerPaymentInTransaction(tx, payment.id, actor));
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).remainingAmount.toString()).toBe('888');
        await db!.$transaction(tx => reverseReturnCreditInTransaction(tx, { returnId: 'return-1', reversalDate: date, reason: 'Synthetic reversal' }, actor));
        expect((await tenantContext.run(db!, () => RekapDagangService.getPiutangRecap({ from: '2026-09-01', to: '2026-09-30' }))).rows[0].closingBalance).toBe(1110);
    });
    it('rejects closed period, missing/invalid source journal, foreign SO and unknown return', async () => {
        await db!.fiscalPeriod.updateMany({ data: { status: 'CLOSED' } }); await expect(post()).rejects.toThrow();
        await db!.fiscalPeriod.updateMany({ data: { status: 'OPEN' } });
        await db!.journalEntry.update({ where: { id: 'source-journal' }, data: { status: 'DRAFT' } }); await expect(post()).rejects.toThrow();
        await db!.journalEntry.update({ where: { id: 'source-journal' }, data: { status: 'POSTED' } });
        await db!.salesOrder.create({ data: { id: 'other-order', orderNumber: 'OTHER', customerId: 'customer' } });
        await db!.invoice.create({ data: { id: 'other-invoice', invoiceNumber: 'OTHER', salesOrderId: 'other-order', totalAmount: 1110 } });
        await expect(post({ invoiceId: 'other-invoice' })).rejects.toThrow('SO dan customer yang sama');
        await expect(post({ returnId: 'foreign' })).rejects.toThrow();
        expect(await db!.salesReturnCredit.count()).toBe(0);
    });
    it('rolls back when audit insertion itself fails', async () => {
        await db!.$executeRawUnsafe(`CREATE FUNCTION reject_manual_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit unavailable'; END $$`);
        await db!.$executeRawUnsafe(`CREATE TRIGGER reject_manual_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_manual_audit()`);
        try { await expect(post()).rejects.toThrow('synthetic audit unavailable'); expect(await db!.salesReturnCredit.count()).toBe(0); }
        finally { await db!.$executeRawUnsafe('DROP TRIGGER reject_manual_audit ON "AuditLog"'); await db!.$executeRawUnsafe('DROP FUNCTION reject_manual_audit()'); }
    });
    it('allows only one winner when snapshot and manual posting race on the same return', async () => {
        await resetReturnFixture(db!, true);
        const outcomes = await Promise.allSettled([post(), db!.$transaction(tx => postReturnCreditInTransaction(tx, { returnId: 'return-1', invoiceId: 'invoice', postingDate: date, lines: [{ returnItemId: 'return-1-item', basisLineId: 'basis' }] }, actor))]);
        expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect(await db!.salesReturnCreditAllocation.count()).toBe(1);
    });
    it('prevents snapshot tax from exceeding source tax already consumed by a manual credit', async () => {
        await resetReturnFixture(db!, true);
        await post({ totalAmount: '110', taxAmount: '110' });
        await createReturn(db!, 'return-2', 2, true);
        const result = await db!.$transaction(tx => postReturnCreditInTransaction(tx, { returnId: 'return-2', invoiceId: 'invoice', postingDate: date, lines: [{ returnItemId: 'return-2-item', basisLineId: 'basis' }] }, actor));
        expect(result.status).toBe('REVIEW_REQUIRED');
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).creditedAmount.toString()).toBe('110');
    });
    it('uses business-day comparisons when source has a later timestamp on the same WIB date', async () => {
        await db!.invoice.update({ where: { id: 'invoice' }, data: { invoiceDate: new Date('2026-09-18T15:00:00+07:00') } });
        await db!.salesReturn.update({ where: { id: 'return-1' }, data: { returnDate: new Date('2026-09-18T12:00:00+07:00') } });
        expect((await post()).status).toBe('POSTED');
    });
    it('protects approval metadata, invoice source journal and whole-return items', async () => {
        const credit = await post();
        await expect(db!.salesReturnCredit.update({ where: { id: credit.id }, data: { evidenceReference: 'changed evidence' } })).rejects.toThrow();
        await expect(db!.journalLine.updateMany({ where: { journalEntryId: 'source-journal' }, data: { description: 'changed' } })).rejects.toThrow();
        await expect(db!.salesReturnItem.update({ where: { id: 'return-1-item' }, data: { returnedQty: 3 } })).rejects.toThrow();
        await expect(db!.invoice.update({ where: { id: 'invoice' }, data: { totalAmount: 2220 } })).rejects.toThrow();
        await db!.customer.create({ data: { id: 'different-customer', name: 'Synthetic other customer' } });
        await expect(db!.salesOrder.update({ where: { id: 'order' }, data: { customerId: 'different-customer' } })).rejects.toThrow();
        await expect(db!.salesReturn.update({ where: { id: 'return-1' }, data: { status: 'CANCELLED' } })).rejects.toThrow();
        await expect(db!.salesReturnItem.create({ data: { salesReturnId: 'return-1', productVariantId: 'variant', returnedQty: 1, unitPrice: 1 } })).rejects.toThrow();
    });
});
