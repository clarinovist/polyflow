import { beforeEach, describe, expect, it, vi } from 'vitest';
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
        await buildInvoiceDocument('test');
        expect(generate).toHaveBeenCalledWith(expect.objectContaining({
            grandTotal: 16642500, remainingBalance: 100.25,
            taxAmount: 1649238.92, dpp: 14993081.08,
        }));
        expect(generate.mock.calls[0][0]).not.toHaveProperty('roundingAmount');
    });
    it('returns null when invoice is absent', async () => {
        db.invoice.findUnique.mockResolvedValue(null);
        expect(await buildInvoiceDocument('missing')).toBeNull();
        expect(generate).not.toHaveBeenCalled();
    });
});
