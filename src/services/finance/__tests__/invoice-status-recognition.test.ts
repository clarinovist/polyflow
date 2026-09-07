import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    db: { invoice: { findUnique: vi.fn(), update: vi.fn() }, journalEntry: { updateMany: vi.fn(), findMany: vi.fn() }, $transaction: vi.fn() },
    recognize: vi.fn(), audit: vi.fn(),
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: mocks.db }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.audit }));
vi.mock('../auto-journal-service', () => ({ AutoJournalService: {} }));
vi.mock('../sales-recognition-service', () => ({
    lockSalesInvoice: () => mocks.db.invoice.findUnique(),
    postSalesInvoiceJournal: mocks.recognize,
    requireOpenJournalPeriod: vi.fn(),
    RECOGNIZED_INVOICE_STATUSES: ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE'],
}));
import { updateInvoiceStatus } from '../invoice-lifecycle-service';
let status = 'DRAFT';
describe('invoice confirmation recognition boundary', () => {
    beforeEach(() => {
        vi.clearAllMocks(); status = 'DRAFT'; mocks.recognize.mockResolvedValue({ action: 'promoted' });
        mocks.db.invoice.findUnique.mockImplementation(async () => ({ id: 'invoice', status, invoiceNumber: 'INV', salesOrder: { entrySource: 'STANDARD' } }));
        mocks.db.invoice.update.mockImplementation(async ({ data }) => { status = data.status; });
        mocks.db.$transaction.mockImplementation(async fn => {
            const before = status;
            try { return await fn(mocks.db); } catch (error) { status = before; throw error; }
        });
    });
    it('runs recognition and audit within its owned transaction', async () => {
        await updateInvoiceStatus({ id: 'invoice', status: 'UNPAID' }, 'finance');
        expect(mocks.recognize).toHaveBeenCalledWith(mocks.db, 'invoice', 'finance');
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tx: mocks.db }));
    });
    it('rejects an emergency draft transition to OVERDUE before finance approval', async () => {
        mocks.db.invoice.findUnique.mockResolvedValue({
            id: 'invoice', status: 'DRAFT', invoiceNumber: 'INV',
            salesOrder: { entrySource: 'EMERGENCY_DISPATCH' },
        });
        await expect(updateInvoiceStatus({ id: 'invoice', status: 'OVERDUE' }, 'finance'))
            .rejects.toMatchObject({ code: 'INVOICE_DRAFT' });
        expect(mocks.db.invoice.update).not.toHaveBeenCalled();
        expect(mocks.recognize).not.toHaveBeenCalled();
    });
    it('does not confirm the source invoice if recognition fails', async () => {
        mocks.recognize.mockRejectedValue(new Error('period closed'));
        await expect(updateInvoiceStatus({ id: 'invoice', status: 'UNPAID' }, 'finance')).rejects.toThrow('period closed');
        expect(status).toBe('DRAFT');
    });
});
