import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
    db: {
        invoice: { findUnique: vi.fn(), update: vi.fn() },
        payment: { findMany: vi.fn(), create: vi.fn() },
        journalEntry: { findMany: vi.fn(), updateMany: vi.fn() },
        $queryRaw: vi.fn(), $transaction: vi.fn(),
    },
    paymentJournal: vi.fn(), audit: vi.fn(),
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: mocks.db, getTenantDbFromContext: () => mocks.db }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/auth/finance-access', () => ({ requireFinanceMutation: vi.fn().mockResolvedValue({ user: { id: 'finance' } }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/config/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.audit }));
vi.mock('@/services/accounting/periods-service', () => ({ isPeriodOpen: vi.fn().mockResolvedValue(true) }));
vi.mock('@/services/accounting/account-resolver', () => ({ resolveAccount: vi.fn().mockResolvedValue({ id: 'ar' }) }));
vi.mock('@/services/finance/auto-journal-service', () => ({ AutoJournalService: { handleSalesPayment: mocks.paymentJournal } }));
vi.mock('@/services/purchasing/purchase-service', () => ({ PurchaseService: {} }));
vi.mock('@/services/settings/app-settings-service', () => ({ getPaymentBanksSetting: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/utils/sequence', () => ({
    getNextSequence: vi.fn().mockResolvedValue('PAY-IN-TEST'),
    retryOnPaymentNumberConflict: (fn: () => Promise<unknown>) => fn(),
}));
import { recordCustomerPayment } from '../payment-mutation-actions';

const input = { invoiceId: 'invoice', amount: 100, paymentDate: '2026-08-20', method: 'Cash' };
const original = () => ({
    invoice: { id: 'invoice', invoiceNumber: 'INV-TEST', status: 'DRAFT', totalAmount: new Prisma.Decimal(100), paidAmount: new Prisma.Decimal(0), creditedAmount: new Prisma.Decimal(0), salesOrder: { entrySource: 'STANDARD' } },
    journalStatus: 'DRAFT', payments: [] as { id: string; amount: number }[],
});
let state = original();

describe('customer payment recognition transaction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state = original();
        mocks.paymentJournal.mockResolvedValue(undefined);
        mocks.db.$queryRaw.mockResolvedValue([{ id: 'invoice' }]);
        mocks.db.invoice.findUnique.mockImplementation(async () => state.invoice);
        mocks.db.invoice.update.mockImplementation(async ({ data }) => {
            state = { ...state, invoice: { ...state.invoice, ...data } };
            return state.invoice;
        });
        mocks.db.payment.findMany.mockResolvedValue([]);
        mocks.db.payment.create.mockImplementation(async ({ data }) => {
            const payment = { id: 'payment', ...data };
            state = { ...state, payments: [...state.payments, payment] };
            return payment;
        });
        mocks.db.journalEntry.findMany.mockImplementation(async () => [{
            id: 'journal', status: state.journalStatus, entryDate: new Date('2026-08-19T00:00:00Z'),
            lines: [
                { accountId: 'ar', debit: new Prisma.Decimal(100), credit: new Prisma.Decimal(0) },
                { accountId: 'revenue', debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(100) },
            ],
        }]);
        mocks.db.journalEntry.updateMany.mockImplementation(async ({ data }) => {
            state = { ...state, journalStatus: data.status };
            return { count: 1 };
        });
        mocks.db.$transaction.mockImplementation(async (fn) => {
            const before = state;
            try { return await fn(mocks.db); } catch (error) { state = before; throw error; }
        });
    });

    it('records a full payment and recognizes the sales journal together', async () => {
        const result = await recordCustomerPayment(input);
        expect(result).toMatchObject({ success: true });
        expect(state.invoice.status).toBe('PAID');
        expect(state.journalStatus).toBe('POSTED');
        expect(mocks.paymentJournal).toHaveBeenCalledWith('payment', 100, 'Cash', undefined, mocks.db);
    });

    it('rolls back payment, invoice and recognition if the receipt journal fails', async () => {
        mocks.paymentJournal.mockRejectedValue(new Error('receipt posting failed'));
        const result = await recordCustomerPayment(input);
        expect(result.success).toBe(false);
        expect(state).toEqual(original());
    });

    it('recognizes a partial payment without marking the invoice paid', async () => {
        expect((await recordCustomerPayment({ ...input, amount: 40 })).success).toBe(true);
        expect(state.invoice.status).toBe('PARTIAL');
        expect(state.journalStatus).toBe('POSTED');
    });

    it('settles only the cash remainder when part of the invoice is credited', async () => {
        state.invoice.creditedAmount = new Prisma.Decimal(30);
        expect((await recordCustomerPayment({ ...input, amount: 70 })).success).toBe(true);
        expect(state.invoice.status).toBe('PAID');
        expect(state.invoice.paidAmount.toString()).toBe('70');
        expect(state.invoice.creditedAmount.toString()).toBe('30');
    });

    it('rejects cancelled invoices without creating payments', async () => {
        state = { ...state, invoice: { ...state.invoice, status: 'CANCELLED' } };
        expect(await recordCustomerPayment(input)).toMatchObject({ success: false, code: 'INVOICE_CANCELLED' });
        expect(state.payments).toEqual([]);
    });

    it('does not bypass approval on emergency draft invoices', async () => {
        state = { ...state, invoice: { ...state.invoice, salesOrder: { entrySource: 'EMERGENCY_DISPATCH' } } };
        expect(await recordCustomerPayment(input)).toMatchObject({ success: false, code: 'INVOICE_DRAFT' });
        expect(state.payments).toEqual([]);
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid amount %s', async amount => {
        expect((await recordCustomerPayment({ ...input, amount })).success).toBe(false);
        expect(state.payments).toEqual([]);
    });

    it('does not save a payment when its sales journal is missing', async () => {
        mocks.db.journalEntry.findMany.mockResolvedValue([]);
        expect(await recordCustomerPayment(input)).toMatchObject({ success: false, code: 'SALES_JOURNAL_MISSING' });
        expect(state).toEqual(original());
    });
});
