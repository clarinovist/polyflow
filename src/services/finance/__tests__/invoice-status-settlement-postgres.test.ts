import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { tenantContext } from '@/lib/core/prisma';
import { actor, resetReturnFixture, returnTestClient } from './return-credit-postgres-fixture';
import { updateInvoiceStatus } from '../invoice-lifecycle-service';

vi.mock('@/services/accounting/account-resolver', () => ({ resolveAccount: async () => ({ id: 'ar' }) }));
const db = process.env.RETURN_CREDIT_TEST_DATABASE_URL ? returnTestClient(process.env.RETURN_CREDIT_TEST_DATABASE_URL) : null;

// Current-schema synthetic database only; never use the application's DATABASE_URL.
describe.skipIf(!db)('invoice status settlement boundary on disposable PostgreSQL', () => {
    beforeEach(async () => { await resetReturnFixture(db!, false); });
    afterAll(async () => { await db?.$disconnect(); });
    it('cannot create a paid invoice without Payment, including through the owned tenant transaction', async () => {
        await expect(tenantContext.run(db!, () => updateInvoiceStatus({ id: 'invoice', status: 'PAID', paidAmount: 1110 }, actor)))
            .rejects.toThrow(/pembayaran/i);
        await expect(tenantContext.run(db!, () => updateInvoiceStatus({ id: 'invoice', status: 'PAID' }, actor)))
            .rejects.toThrow(/saldo/i);
        const invoice = await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } });
        expect(invoice.status).toBe('UNPAID');
        expect(invoice.paidAmount.toString()).toBe('0');
        expect(await db!.payment.count()).toBe(0);
        expect(await db!.auditLog.count()).toBe(0);
    });
    it('leaves historical cache mismatches untouched for explicit Finance reconciliation', async () => {
        await db!.invoice.update({ where: { id: 'invoice' }, data: { status: 'PAID', paidAmount: 1110 } });
        await expect(tenantContext.run(db!, () => updateInvoiceStatus({ id: 'invoice', status: 'UNPAID' }, actor))).rejects.toThrow(/rekonsiliasi/i);
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).paidAmount.toString()).toBe('1110');
        expect(await db!.auditLog.count()).toBe(0);
    });
    it('keeps source, journal and audit atomic when audit insertion fails', async () => {
        await db!.invoice.update({ where: { id: 'invoice' }, data: { status: 'DRAFT' } });
        await db!.journalEntry.update({ where: { id: 'source-journal' }, data: { status: 'DRAFT' } });
        await expect(db!.$transaction(tx => updateInvoiceStatus({ id: 'invoice', status: 'UNPAID' }, 'missing-actor', tx))).rejects.toThrow();
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).status).toBe('DRAFT');
        expect((await db!.journalEntry.findUniqueOrThrow({ where: { id: 'source-journal' } })).status).toBe('DRAFT');
        expect(await db!.auditLog.count()).toBe(0);
        await db!.$transaction(tx => updateInvoiceStatus({ id: 'invoice', status: 'UNPAID' }, actor, tx));
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).status).toBe('UNPAID');
        expect((await db!.journalEntry.findUniqueOrThrow({ where: { id: 'source-journal' } })).status).toBe('POSTED');
        expect(await db!.auditLog.count({ where: { action: 'UPDATE_INVOICE' } })).toBe(1);
    });
    it('locks the source invoice and reads fresh payment evidence rather than a stale status', async () => {
        let locked!: () => void;
        const acquired = new Promise<void>(resolve => { locked = resolve; });
        let unlock!: () => void;
        const release = new Promise<void>(resolve => { unlock = resolve; });
        const writer = db!.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id='invoice' FOR UPDATE`;
            locked();
            await release;
            await tx.payment.create({ data: { paymentNumber: 'SYNTHETIC-PAY', invoiceId: 'invoice', amount: 1110, paymentDate: new Date(), method: 'Cash' } });
            await tx.invoice.update({ where: { id: 'invoice' }, data: { paidAmount: 1110, status: 'PAID' } });
        });
        await acquired;
        const reader = db!.$transaction(tx => updateInvoiceStatus({ id: 'invoice', status: 'PAID' }, actor, tx));
        unlock();
        await Promise.all([writer, reader]);
        expect(await db!.payment.count()).toBe(1);
        expect((await db!.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).paidAmount.toString()).toBe('1110');
        await expect(db!.$transaction(tx => updateInvoiceStatus({ id: 'invoice', status: 'CANCELLED' }, actor, tx))).rejects.toThrow(/pembayaran/i);
    });
});
