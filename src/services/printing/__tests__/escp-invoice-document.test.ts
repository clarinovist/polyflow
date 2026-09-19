import { beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshotFixture } from '@/lib/finance/__tests__/invoice-snapshot-fixture';
const { db, generate, company } = vi.hoisted(() => ({
    db: { invoice: { findUnique: vi.fn() } }, generate: vi.fn().mockReturnValue([1, 2]),
    company: { name: 'Example', address: 'Example address', phone: '', whatsapp: '', email: '',
        bankAccountsPPN: [], bankAccountsNonPPN: [], paperSize: { heightCm: 13.97, widthCm: 24.13 } },
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: db }));
vi.mock('@/lib/config/company-settings', () => ({ getCompanyConfigWithOverridesAsync: vi.fn().mockResolvedValue(company) }));
vi.mock('../escp-generator', () => ({ generateEscpInvoice: generate }));
import { buildInvoiceDocument } from '../escp-invoice-document';

describe('ESC/P invoice persisted rounding mapping', () => {
    beforeEach(() => vi.clearAllMocks());
    it.each([180, null])('maps adjustment %s without recalculating stored total or balance', async roundingAmount => {
        db.invoice.findUnique.mockResolvedValue({ invoiceNumber: 'INV-TEST', invoiceDate: new Date(),
            totalAmount: 16642500, paidAmount: 16642399.75, roundingAmount,
            salesOrder: { taxAmount: 1649238.92, items: [{ quantity: 1, unitPrice: 16642320, subtotal: 16642320 }] },
        });
        await expect(buildInvoiceDocument('test')).rejects.toThrow(/tanpa snapshot/);
        expect(generate).not.toHaveBeenCalled();
    });
    it('prints snapshot quantity and tax instead of changed SO', async () => {
        db.invoice.findUnique.mockResolvedValue({ invoiceNumber: 'INV-TEST', invoiceDate: new Date(), totalAmount: 1000, paidAmount: 0,
            commercialSnapshot: snapshotFixture(), salesOrder: { items: [{ quantity: 999, subtotal: 99999 }] } });
        await buildInvoiceDocument('test');
        expect(generate).toHaveBeenCalledWith(expect.objectContaining({ totalQty: 80, taxAmount: 80, shippingCost: 20,
            items: [expect.objectContaining({ name: 'Original A', qty: 80, lineTotal: 880 })] }));
    });
    it('maps net receivable after return credit without changing payment or gross', async () => {
        db.invoice.findUnique.mockResolvedValue({ invoiceNumber: 'INV-TEST', invoiceDate: new Date(), totalAmount: 1000, paidAmount: 200, creditedAmount: 300, priceAdjustmentAmount: 50, commercialSnapshot: snapshotFixture(), salesOrder: { items: [] } });
        await buildInvoiceDocument('test');
        expect(generate).toHaveBeenCalledWith(expect.objectContaining({ grandTotal: 1000, paidAmount: 200, creditedAmount: 300, priceAdjustmentAmount: 50, remainingBalance: 550 }));
    });
    it('returns null when invoice is absent', async () => {
        db.invoice.findUnique.mockResolvedValue(null);
        expect(await buildInvoiceDocument('missing')).toBeNull();
        expect(generate).not.toHaveBeenCalled();
    });
});
