import { beforeEach, describe, expect, it, vi } from 'vitest';
const { db, generate, company } = vi.hoisted(() => ({
    db: { deliveryOrder: { findUnique: vi.fn() } }, generate: vi.fn().mockReturnValue([1, 2]),
    company: { name: 'Example', address: 'Line 1\nLine 2', phone: '', whatsapp: '', email: '',
        paperSize: { heightCm: 13.97, widthCm: 24.13 } },
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: db }));
vi.mock('@/lib/config/company-settings', () => ({ getCompanyConfigWithOverridesAsync: vi.fn().mockResolvedValue(company) }));
vi.mock('../escp-delivery', () => ({ generateEscpDeliveryNote: generate }));
import { buildDeliveryNoteDocument } from '../escp-delivery-document';

const line = (name: string | null, extra: Record<string, unknown> = {}) => ({
    quantity: 10, enteredQuantity: null, enteredUnit: null, notes: null,
    productVariant: { name, salesUnit: null, primaryUnit: 'KG', product: { name: 'Produk Induk' } }, ...extra,
});

describe('ESC/P Surat Jalan mapping', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns null for an unknown delivery order', async () => {
        db.deliveryOrder.findUnique.mockResolvedValue(null);

        await expect(buildDeliveryNoteDocument('missing')).resolves.toBeNull();
        expect(generate).not.toHaveBeenCalled();
    });

    it('prints lines in invoice order (name A–Z, natural numbers) with the shared fallbacks', async () => {
        // Arrange — stored in insertion order, not name order
        db.deliveryOrder.findUnique.mockResolvedValue({
            orderNumber: 'DO-TEST', deliveryDate: '2026-10-31T00:00:00Z', destinationAddress: null,
            salesOrder: { orderNumber: 'SO-TEST', customer: { name: 'Pelanggan', shippingAddress: 'Alamat kirim', billingAddress: null } },
            vehicle: null,
            items: [
                line('WARNA B 15', { enteredQuantity: 2, enteredUnit: 'BAL', notes: 'catatan' }),
                line('WARNA A 21'),
                line(null),
                line('WARNA A 9'),
            ],
        });

        // Act
        const document = await buildDeliveryNoteDocument('do-1');

        // Assert
        expect(document?.documentNumber).toBe('DO-TEST');
        expect(generate).toHaveBeenCalledWith(expect.objectContaining({
            companyAddress: 'Line 1, Line 2', destinationAddress: 'Alamat kirim', salesOrderNumber: 'SO-TEST', vehiclePlate: '',
            items: [
                { name: 'Produk Induk', qty: 10, unit: 'KG', note: '' },
                { name: 'WARNA A 9', qty: 10, unit: 'KG', note: '' },
                { name: 'WARNA A 21', qty: 10, unit: 'KG', note: '' },
                { name: 'WARNA B 15', qty: 2, unit: 'BAL', note: 'catatan' },
            ],
        }));
    });
});
