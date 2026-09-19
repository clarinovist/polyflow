import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { actor, createReturn, date, resetReturnFixture, returnTestClient } from './return-credit-postgres-fixture';
vi.mock('@/services/accounting/account-resolver', () => ({ resolveAccount: async (role: string) => ({ id: role === 'vat-output' ? 'vat' : role === 'sales-return' ? 'return' : 'ar' }) }));
import { tenantContext } from '@/lib/core/prisma';
import { prepareReturnCreditProposal, postProposedReturnCredit } from '../return-credit-proposal-service';
const db = process.env.RETURN_CREDIT_TEST_DATABASE_URL ? returnTestClient(process.env.RETURN_CREDIT_TEST_DATABASE_URL) : null;
const preview = () => db!.$transaction(tx => prepareReturnCreditProposal(tx, 'return-1'));
describe.skipIf(!db)('proposed return posting on disposable PostgreSQL', () => {
    beforeEach(async () => { await resetReturnFixture(db!, false); });
    afterAll(async () => { await db?.$disconnect(); });
    it('prepares snapshot amount, posts and reduces outstanding immediately, retry exactly once', async () => {
        const proposal = await preview(); expect(proposal.ready).toBe(true); if (!proposal.ready) throw Error(proposal.reason);
        expect(proposal).toMatchObject({ invoiceId: 'invoice', totalAmount: '222.00', taxAmount: '22.00', remainingAfter: '888.00', source: 'SNAPSHOT' });
        const input = { returnId: 'return-1', fingerprint: proposal.fingerprint, postingDate: date, confirmed: true };
        const results = await Promise.all([tenantContext.run(db!, () => postProposedReturnCredit(input, actor)), tenantContext.run(db!, () => postProposedReturnCredit(input, actor))]);
        expect(results[0].id).toBe(results[1].id);
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).remainingAmount.toString()).toBe('888');
        expect(await db!.payment.count()).toBe(0); expect(await db!.salesReturnReceiptLine.count()).toBe(0);
        expect(await db!.salesReturnCredit.count()).toBe(1);
        await createReturn(db!, 'return-2', 1, false);
        expect(await db!.$transaction(tx => prepareReturnCreditProposal(tx, 'return-2'))).toMatchObject({ ready: false });
    });
    it('uses a clearly labeled matching SO proposal for legacy invoices without fabricating a snapshot', async () => {
        await db!.invoice.update({ where: { id: 'invoice' }, data: { status: 'DRAFT' } }); await db!.invoiceReturnBasisLine.deleteMany(); await db!.invoice.update({ where: { id: 'invoice' }, data: { status: 'UNPAID' } });
        const proposal = await preview(); expect(proposal).toMatchObject({ ready: true, source: 'SO_REVIEW', totalAmount: '222.00' });
        if (!proposal.ready) throw Error(proposal.reason);
        await tenantContext.run(db!, () => postProposedReturnCredit({ returnId: 'return-1', fingerprint: proposal.fingerprint, postingDate: date, confirmed: true }, actor));
        expect(await db!.invoiceReturnBasisLine.count()).toBe(0);
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).remainingAmount.toString()).toBe('888');
    });
    it('rejects changed source quantities or balance since preview', async () => {
        const proposal = await preview(); if (!proposal.ready) throw Error(proposal.reason);
        await db!.salesReturnItem.update({ where: { id: 'return-1-item' }, data: { returnedQty: 3 } });
        await expect(tenantContext.run(db!, () => postProposedReturnCredit({ returnId: 'return-1', fingerprint: proposal.fingerprint, postingDate: date, confirmed: true }, actor))).rejects.toThrow(/berubah/);
        expect(await db!.salesReturnCredit.count()).toBe(0);
    });
    it('does not choose the first invoice or accept legacy journals', async () => {
        await db!.invoice.create({ data: { id: 'another', invoiceNumber: 'ANOTHER', salesOrderId: 'order', totalAmount: 500 } });
        expect(await preview()).toMatchObject({ ready: false, reason: expect.stringContaining('tepat satu invoice') });
        await db!.invoice.delete({ where: { id: 'another' } });
        await db!.journalEntry.create({ data: { entryNumber: 'LEGACY', entryDate: date, referenceType: 'SALES_RETURN', referenceId: 'return-1', description: 'Synthetic' } });
        expect(await preview()).toMatchObject({ ready: false });
    });
    it('rejects changed balance, closed period, missing invoice/journal and later return history', async () => {
        const proposal = await preview(); if (!proposal.ready) throw Error(proposal.reason);
        const command = { returnId: 'return-1', fingerprint: proposal.fingerprint, postingDate: date, confirmed: true };
        await db!.invoice.update({ where: { id: 'invoice' }, data: { paidAmount: 100 } });
        await expect(tenantContext.run(db!, () => postProposedReturnCredit(command, actor))).rejects.toThrow(/berubah/);
        await db!.invoice.update({ where: { id: 'invoice' }, data: { paidAmount: 0 } });
        const fresh = await preview(); if (!fresh.ready) throw Error(fresh.reason);
        await db!.fiscalPeriod.updateMany({ data: { status: 'CLOSED' } });
        await expect(tenantContext.run(db!, () => postProposedReturnCredit({ ...command, fingerprint: fresh.fingerprint }, actor))).rejects.toThrow(/Periode/);
        expect(await db!.salesReturnCredit.count()).toBe(0);
        await db!.journalEntry.update({ where: { id: 'source-journal' }, data: { status: 'DRAFT' } });
        expect(await preview()).toMatchObject({ ready: false });
    });
    it('refuses overbalance, unknown return, cancelled/draft state and customer mismatch', async () => {
        await expect(db!.$transaction(tx => prepareReturnCreditProposal(tx, 'foreign'))).rejects.toThrow();
        await db!.salesReturn.update({ where: { id: 'return-1' }, data: { status: 'DRAFT' } }); expect(await preview()).toMatchObject({ ready: false });
        await db!.salesReturn.update({ where: { id: 'return-1' }, data: { status: 'RECEIVED' } });
        await db!.invoice.update({ where: { id: 'invoice' }, data: { paidAmount: 1000 } }); expect(await preview()).toMatchObject({ ready: false });
        await db!.invoice.update({ where: { id: 'invoice' }, data: { status: 'PAID' } }); expect(await preview()).toMatchObject({ ready: false });
        await db!.invoice.update({ where: { id: 'invoice' }, data: { status: 'UNPAID', paidAmount: 0 } });
        await db!.salesReturn.update({ where: { id: 'return-1' }, data: { customerId: null } }); expect(await preview()).toMatchObject({ ready: false });
    });
    it('keeps identical document IDs in different tenant databases isolated', async () => {
        const otherUrl = new URL(process.env.RETURN_CREDIT_TEST_DATABASE_URL!); otherUrl.pathname = '/polyflow_return_credit_tenant_test';
        const other = returnTestClient(otherUrl.toString());
        try {
            await resetReturnFixture(other, false);
            const proposal = await preview(); if (!proposal.ready) throw Error(proposal.reason);
            await expect(tenantContext.run(other, () => postProposedReturnCredit({ returnId: 'return-1', fingerprint: proposal.fingerprint, postingDate: date, confirmed: true }, actor))).rejects.toThrow(/berubah/);
            expect(await other.salesReturnCredit.count()).toBe(0);
            expect(await db!.salesReturnCredit.count()).toBe(0);
        } finally { await other.$disconnect(); }
    });
    it('rejects invalid invoice currency and a source total mismatch rather than pricing automatically', async () => {
        await db!.journalLine.updateMany({ where: { journalEntryId: 'source-journal' }, data: { currency: 'USD' } });
        expect(await preview()).toMatchObject({ ready: false });
        await db!.journalLine.updateMany({ where: { journalEntryId: 'source-journal' }, data: { currency: 'IDR' } });
        await db!.invoice.update({ where: { id: 'invoice' }, data: { status: 'DRAFT' } }); await db!.invoiceReturnBasisLine.deleteMany(); await db!.invoice.update({ where: { id: 'invoice' }, data: { status: 'UNPAID' } });
        await db!.salesOrderItem.update({ where: { id: 'source-item' }, data: { unitPrice: 999 } });
        expect(await preview()).toMatchObject({ ready: false });
    });
    it('rolls back posting when transaction audit fails', async () => {
        const proposal = await preview(); if (!proposal.ready) throw Error(proposal.reason);
        await db!.$executeRawUnsafe(`CREATE FUNCTION reject_proposal_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'proposal audit failed'; END $$`);
        await db!.$executeRawUnsafe(`CREATE TRIGGER reject_proposal_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_proposal_audit()`);
        try {
            await expect(tenantContext.run(db!, () => postProposedReturnCredit({ returnId: 'return-1', fingerprint: proposal.fingerprint, postingDate: date, confirmed: true }, actor))).rejects.toThrow('proposal audit failed');
            expect(await db!.salesReturnCredit.count()).toBe(0);
            expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).remainingAmount.toString()).toBe('1110');
        } finally { await db!.$executeRawUnsafe('DROP TRIGGER reject_proposal_audit ON "AuditLog"'); await db!.$executeRawUnsafe('DROP FUNCTION reject_proposal_audit()'); }
    });
    it('fails closed without tenant context and refuses unconfirmed input', async () => {
        await expect(postProposedReturnCredit({ returnId: 'return-1', fingerprint: 'a'.repeat(64), postingDate: date, confirmed: true }, actor)).rejects.toThrow('tenant');
        await expect(tenantContext.run(db!, () => postProposedReturnCredit({ returnId: 'return-1', fingerprint: 'a'.repeat(64), postingDate: date, confirmed: false }, actor))).rejects.toThrow();
    });
});
