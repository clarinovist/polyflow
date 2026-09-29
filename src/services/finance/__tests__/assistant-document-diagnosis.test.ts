import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
vi.mock('@/services/purchasing/invoices-service', () => ({ calculatePoInvoiceTotalFromReceipts: vi.fn().mockResolvedValue(100) }));
vi.mock('../return-credit-proposal-service', () => ({ prepareReturnCreditProposal: vi.fn().mockResolvedValue({ ready: false, reason: 'Menunggu penerimaan barang.' }) }));
vi.mock('@/services/accounting/periods-service', () => ({ isPeriodOpen: vi.fn().mockResolvedValue(true) }));
import { calculatePoInvoiceTotalFromReceipts } from '@/services/purchasing/invoices-service';
import { prepareReturnCreditProposal } from '../return-credit-proposal-service';
import { isPeriodOpen } from '@/services/accounting/periods-service';
import { inspectPurchaseInvoice, inspectSalesReturnCredit } from '../assistant-document-diagnosis';
import { purchaseInvoiceEvidence, salesReturnCreditEvidence } from '@/lib/bot/document-diagnosis-evidence';

const decimal = (n: number) => new Prisma.Decimal(n);
const bill = { id: 'bill', invoiceNumber: 'BILL-2026-0421', status: 'DRAFT', invoiceDate: new Date('2026-09-01'), dueDate: null, totalAmount: decimal(100), paidAmount: decimal(0), purchaseOrder: { id: 'po', orderNumber: 'PO-2026-0421', status: 'RECEIVED', entrySource: 'WALK_IN_RECEIPT', commercialReviewStatus: 'PENDING', _count: { goodsReceipts: 1, invoices: 1 } } };
const returned = { id: 'return', returnNumber: 'SR-2026-0421', status: 'DRAFT', returnDate: new Date('2026-09-01'), salesOrder: { orderNumber: 'SO-2026-0421' }, credit: null, customerCredit: null, _count: { items: 1 } };
function fixture() {
    return {
        purchaseInvoice: { findMany: vi.fn().mockResolvedValue([bill]), aggregate: vi.fn().mockResolvedValue({ _sum: { totalAmount: decimal(100) }, _count: { _all: 1 } }) },
        goodsReceipt: { findMany: vi.fn().mockResolvedValue([{ id: 'gr', receiptNumber: 'GR-2026-0421', receivedDate: new Date() }]) },
        journalEntry: { findMany: vi.fn().mockResolvedValue([]) },
        purchasePayment: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: decimal(0) }, _count: { _all: 0 } }) },
        payment: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null }, _count: { _all: 0 } }) },
        salesReturn: { findMany: vi.fn().mockResolvedValue([returned]) },
        salesReturnItem: { count: vi.fn().mockResolvedValue(0) },
    };
}
let mock: ReturnType<typeof fixture>;
const tx = () => mock as unknown as Prisma.TransactionClient;
beforeEach(() => { vi.clearAllMocks(); mock = fixture(); vi.mocked(isPeriodOpen).mockResolvedValue(true); });

describe('purchase invoice query and evidence', () => {
    it('explains draft walk-in using receipt selector and bounded independent payment sources', async () => {
        const result = await inspectPurchaseInvoice(tx(), 'BILL - 2026 -0421', true);
        expect(calculatePoInvoiceTotalFromReceipts).toHaveBeenCalledWith('po', { tx: tx(), fallbackToPoTotal: false });
        expect(result.diagnosis?.draftExplanation).toContain('approval Finance');
        expect(mock.purchaseInvoice.findMany.mock.calls[0][0].where.OR).toContainEqual({ invoiceNumber: { equals: 'BILL-2026-0421', mode: 'insensitive' } });
        const e = purchaseInvoiceEvidence(result, 'BILL - 2026 -0421');
        expect(e.searchMeta?.matchCount).toBe(1);
        expect(e.entities?.[0].href).toBe('/finance/invoices/purchase/bill');
        expect(e.facts.find(f => f.label === 'Pembayaran')?.value).toContain('jangan dijumlahkan');
        expect(e.facts.find(f => f.label === 'Jurnal aktif')?.value).toContain('Belum ditemukan');
    });
    it('does not diagnose missing, ambiguous or status-only lookups', async () => {
        mock.purchaseInvoice.findMany.mockResolvedValue([]);
        expect(purchaseInvoiceEvidence(await inspectPurchaseInvoice(tx(), 'absent', true), 'absent').summary).toContain('tidak ditemukan');
        mock.purchaseInvoice.findMany.mockResolvedValue(Array.from({ length: 6 }, () => bill));
        expect(purchaseInvoiceEvidence(await inspectPurchaseInvoice(tx(), 'BILL', true), 'BILL').summary).toContain('minimal 6');
        mock.purchaseInvoice.findMany.mockResolvedValue([bill]);
        expect((await inspectPurchaseInvoice(tx(), 'bill', false)).diagnosis).toBeUndefined();
        expect(calculatePoInvoiceTotalFromReceipts).not.toHaveBeenCalled();
    });
    it('does not prescribe walk-in approval to non-walk-in drafts and reports closed periods', async () => {
        mock.purchaseInvoice.findMany.mockResolvedValue([{ ...bill, purchaseOrder: { ...bill.purchaseOrder, entrySource: 'STANDARD' } }]);
        vi.mocked(isPeriodOpen).mockResolvedValue(false);
        expect((await inspectPurchaseInvoice(tx(), 'bill', true)).diagnosis).toMatchObject({ invoicePeriodOpen: false, draftExplanation: expect.stringContaining('bukan walk-in') });
    });
    it('handles recognized bills, empty aggregates and active journals without suggesting approval', async () => {
        mock.purchaseInvoice.findMany.mockResolvedValue([{ ...bill, status: 'PAID', paidAmount: decimal(100) }]);
        mock.purchaseInvoice.aggregate.mockResolvedValue({ _sum: { totalAmount: null }, _count: { _all: 0 } });
        mock.goodsReceipt.findMany.mockResolvedValue([]);
        mock.journalEntry.findMany.mockResolvedValue([{ entryNumber: 'JOURNAL', status: 'POSTED' }]);
        const result = await inspectPurchaseInvoice(tx(), 'bill', true);
        expect(result.diagnosis?.draftExplanation).toBeNull();
        expect(purchaseInvoiceEvidence(result, 'bill').facts.find(f => f.label === 'Jurnal aktif')?.value).toContain('POSTED');
    });
});

describe('return credit query and evidence', () => {
    it('reuses the Finance proposal and separately checks the requested period and receipts', async () => {
        const date = new Date('2026-09-29T00:00:00+07:00');
        const result = await inspectSalesReturnCredit(tx(), 'SR‑2026‑0421', date);
        expect(prepareReturnCreditProposal).toHaveBeenCalledWith(tx(), 'return');
        expect(isPeriodOpen).toHaveBeenCalledWith(date, tx());
        expect(result.diagnosis).toMatchObject({ receivedItems: 0, itemCount: 1, postingDay: '2026-09-29' });
        expect(salesReturnCreditEvidence(result, 'SR‑2026‑0421').facts.find(f => f.label === 'Usulan Finance')?.value).toBe('Menunggu penerimaan barang.');
    });
    it('requires selection for missing or ambiguous returns', async () => {
        mock.salesReturn.findMany.mockResolvedValue([]);
        expect(salesReturnCreditEvidence(await inspectSalesReturnCredit(tx(), 'missing', new Date()), 'missing').summary).toContain('tidak ditemukan');
        mock.salesReturn.findMany.mockResolvedValue(Array.from({ length: 6 }, () => returned));
        expect(salesReturnCreditEvidence(await inspectSalesReturnCredit(tx(), 'SR', new Date()), 'SR').summary).toContain('minimal 6');
        expect(prepareReturnCreditProposal).not.toHaveBeenCalled();
    });
    it('never reproposes a return already settled with a customer credit', async () => {
        mock.salesReturn.findMany.mockResolvedValue([{ ...returned, customerCredit: { id: 'credit', status: 'POSTED' } }]);
        const result = await inspectSalesReturnCredit(tx(), 'SR', new Date());
        expect(result.diagnosis?.proposal).toMatchObject({ ready: false, reason: expect.stringContaining('jangan posting ulang') });
        expect(prepareReturnCreditProposal).not.toHaveBeenCalled();
    });
    it('does not describe a ready proposal as posting approval and reports closed periods', async () => {
        vi.mocked(prepareReturnCreditProposal).mockResolvedValueOnce({ ready: true, invoiceId: 'invoice', invoiceNumber: 'INV-2026-0421', orderNumber: 'SO-2026-0421', totalAmount: '100', taxAmount: '0', remaining: '100', remainingAfter: '0', source: 'SNAPSHOT', fingerprint: 'private-hash', evidence: 'private-source' });
        vi.mocked(isPeriodOpen).mockResolvedValue(false);
        const result = await inspectSalesReturnCredit(tx(), 'SR', new Date());
        const e = salesReturnCreditEvidence(result, 'SR');
        expect(e.completeness).toBe('partial');
        expect(e.facts.find(f => f.label === 'Usulan Finance')?.value).toContain('konfirmasi sendiri');
        expect(JSON.stringify(e)).not.toContain('private-hash');
        expect(e.facts.find(f => f.label === 'Periode tanggal posting yang diperiksa')?.value).toContain('posting tertahan');
    });
});
