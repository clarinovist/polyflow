import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const connection = process.env.ROUNDING_TEST_DATABASE_URL;
    if (!connection) return { prisma: undefined, getTenantDbFromContext: () => undefined, getTenantIdFromContext: () => undefined };
    const url = new URL(connection);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/polyflow_rounding_test') {
        throw new Error('Requires disposable localhost polyflow_rounding_test database');
    }
    const client = new PrismaClient({ datasources: { db: { url: connection } } });
    return { prisma: client, getTenantDbFromContext: () => client, getTenantIdFromContext: () => undefined };
});
vi.mock('@/services/accounting/account-resolver', () => ({ resolveAccount: vi.fn() }));
vi.mock('@/services/accounting/tenant-revenue-rule-service', () => ({ loadActiveTenantRevenueRules: vi.fn().mockResolvedValue([]) }));
vi.mock('@/services/settings/app-settings-service', () => ({ getPaymentBanksSetting: vi.fn().mockResolvedValue([]) }));
import { prisma as db } from '@/lib/core/prisma';
import { resolveAccount } from '@/services/accounting/account-resolver';
import { createInvoice, createDraftInvoiceFromOrder } from '../invoice-lifecycle-service';
import { recordCustomerPaymentInTransaction } from '../customer-payment-service';
import { syncSalesOrderShippingFromDeliveries } from '@/services/sales/delivery-shipping-sync';

const actor = 'rounding-test-actor';
const date = new Date();
const input = { salesOrderId: 'order', invoiceDate: date, termOfPaymentDays: 30 };
const accountFor = (role: string) => {
    const id = ({ 'accounts-receivable': 'ar', 'sales-revenue': 'revenue', 'vat-output': 'vat',
        'sales-rounding-income': 'rounding', 'petty-cash': 'cash' } as Record<string, string>)[role] ?? 'cash';
    return { id, code: id, name: role };
};

describe.skipIf(!process.env.ROUNDING_TEST_DATABASE_URL)('new invoice rounding on disposable PostgreSQL', () => {
    beforeEach(async () => {
        vi.mocked(resolveAccount).mockImplementation(async role => accountFor(role));
        expect((await db.$queryRaw<{ db: string }[]>`SELECT current_database() db`)[0].db).toBe('polyflow_rounding_test');
        await db.$executeRaw`TRUNCATE "AuditLog", "JournalLine", "JournalEntry", "Payment", "Invoice", "SalesOrder", "Customer", "Account", "FiscalPeriod", "SystemSequence", "User" CASCADE`;
        await db.user.create({ data: { id: actor, email: 'test@example.invalid', password: randomUUID(), role: 'FINANCE' } });
        await db.customer.create({ data: { id: 'customer', name: 'Synthetic customer' } });
        await db.account.createMany({ data: [
            { id: 'ar', code: 'AR', name: 'AR', type: 'ASSET', category: 'CURRENT_ASSET' },
            { id: 'cash', code: 'CASH', name: 'Cash', type: 'ASSET', category: 'CURRENT_ASSET' },
            { id: 'revenue', code: 'REV', name: 'Sales Revenue', type: 'REVENUE', category: 'OPERATING_REVENUE' },
            { id: 'rounding', code: 'ROUND', name: 'Rounding Income', type: 'REVENUE', category: 'OTHER_REVENUE' },
            { id: 'vat', code: 'VAT', name: 'VAT Output', type: 'LIABILITY', category: 'CURRENT_LIABILITY' },
        ] });
        await db.fiscalPeriod.createMany({ data: Array.from({ length: 12 }, (_, i) => ({
            name: `Period ${i + 1}`, year: date.getFullYear(), month: i + 1, status: 'OPEN' as const,
            startDate: new Date(Date.UTC(date.getFullYear(), i, 1)), endDate: new Date(Date.UTC(date.getFullYear(), i + 1, 0)),
        })) });
        await db.systemSequence.create({ data: { key: `JOURNAL_ENTRY_${date.getFullYear()}`, value: 100 } });
        await db.salesOrder.create({ data: { id: 'order', orderNumber: 'SO-TEST', status: 'DELIVERED',
            customerId: 'customer', totalAmount: 16642320, taxAmount: 1649238.92 } });
    });
    afterAll(async () => { await db.$disconnect(); });

    it('creates balanced rounded AR with unchanged VAT, accepts exact settlement without extra rounding', async () => {
        const invoice = await createInvoice(input, actor);
        expect(Number(invoice.totalAmount)).toBe(16642500);
        expect(Number(invoice.roundingAmount)).toBe(180);
        const lines = await db.journalLine.findMany();
        expect(Number(lines.find(l => l.accountId === 'vat')?.credit)).toBe(1649238.92);
        expect(Number(lines.find(l => l.accountId === 'rounding')?.credit)).toBe(180);
        const pay = (amount: number) => db.$transaction(tx => recordCustomerPaymentInTransaction(tx, {
            invoiceId: invoice.id, amount, method: 'Cash', paymentDate: date,
        }, randomUUID(), actor));
        await pay(100.25);
        await pay(16642399.75);
        const settled = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
        expect(settled.status).toBe('PAID');
        expect(settled.paidAmount.eq(settled.totalAmount)).toBe(true);
        await expect(pay(0.01)).rejects.toMatchObject({ code: 'PAYMENT_EXCEEDS_BALANCE' });
        const ar = await db.journalLine.aggregate({ where: { accountId: 'ar', journalEntry: { status: 'POSTED' } }, _sum: { debit: true, credit: true } });
        expect(ar._sum.debit?.eq(ar._sum.credit!)).toBe(true);
    });

    it.each(['account', 'period', 'audit'])('rolls back new invoice, journal and audit on %s failure', async failure => {
        if (failure === 'account') vi.mocked(resolveAccount).mockImplementation(async role => {
            if (role === 'sales-rounding-income') throw new Error('Account missing');
            return accountFor(role);
        });
        if (failure === 'period') await db.fiscalPeriod.updateMany({ data: { status: 'CLOSED' } });
        await expect(createInvoice(input, failure === 'audit' ? 'missing-actor' : actor)).rejects.toThrow();
        expect(await db.invoice.count()).toBe(0);
        expect(await db.journalEntry.count()).toBe(0);
        expect(await db.auditLog.count()).toBe(0);
    });

    it('keeps draft GL consistent when rounding changes and rolls back failed refresh', async () => {
        const invoice = (await createDraftInvoiceFromOrder('order', actor))!;
        await db.salesOrder.update({ where: { id: 'order' }, data: { totalAmount: 16642400 } });
        await createDraftInvoiceFromOrder('order', actor);
        expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).roundingAmount)).toBe(100);
        expect(await db.journalEntry.count({ where: { status: 'DRAFT' } })).toBe(1);
        expect(await db.journalEntry.count({ where: { status: 'VOIDED' } })).toBe(1);
        await db.salesOrder.update({ where: { id: 'order' }, data: { totalAmount: 16642420 } });
        await db.fiscalPeriod.updateMany({ data: { status: 'CLOSED' } });
        await expect(createDraftInvoiceFromOrder('order', actor)).rejects.toThrow();
        expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).roundingAmount)).toBe(100);
        expect(await db.journalEntry.count({ where: { status: 'DRAFT' } })).toBe(1);
    });

    it('shipping sync keeps rounded draft and GL atomic, including a journal failure', async () => {
        const invoice = (await createDraftInvoiceFromOrder('order', actor))!;
        await db.salesOrder.update({ where: { id: 'order' }, data: { totalAmount: 16642400, shippingCost: 80 } });
        // No billable DO: sync removes old shipping and returns to the original base.
        await syncSalesOrderShippingFromDeliveries('order', { userId: actor });
        expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).roundingAmount)).toBe(180);
        await db.salesOrder.update({ where: { id: 'order' }, data: { totalAmount: 16642400, shippingCost: 50 } });
        await db.fiscalPeriod.updateMany({ data: { status: 'CLOSED' } });
        await expect(syncSalesOrderShippingFromDeliveries('order', { userId: actor })).rejects.toThrow();
        expect(Number((await db.salesOrder.findUniqueOrThrow({ where: { id: 'order' } })).shippingCost)).toBe(50);
        expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).roundingAmount)).toBe(180);
        expect(await db.journalEntry.count({ where: { status: 'DRAFT' } })).toBe(1);
    });

    it('concurrent auto-generation makes one draft, then no duplicate supplementary', async () => {
        await Promise.all([createDraftInvoiceFromOrder('order', actor), createDraftInvoiceFromOrder('order', actor)]);
        expect(await db.invoice.count()).toBe(1);
        await db.invoice.updateMany({ data: { status: 'UNPAID' } });
        await db.salesOrder.update({ where: { id: 'order' }, data: { totalAmount: 16642640 } });
        await Promise.all([createDraftInvoiceFromOrder('order', actor), createDraftInvoiceFromOrder('order', actor)]);
        const invoices = await db.invoice.findMany({ orderBy: { createdAt: 'asc' } });
        expect(invoices).toHaveLength(2);
        expect(Number(invoices[1].totalAmount)).toBe(500);
        expect(Number(invoices[1].roundingAmount)).toBe(180);
    });
});
