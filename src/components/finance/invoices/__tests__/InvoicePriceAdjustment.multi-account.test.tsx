// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ load: vi.fn(), post: vi.fn(), reverse: vi.fn(), refresh: vi.fn() }));
vi.mock('@/actions/finance/invoice-price-adjustment', () => ({ getInvoicePriceAdjustmentContext: m.load, postFinanceInvoicePriceAdjustment: m.post, reverseFinanceInvoicePriceAdjustment: m.reverse }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }));
import { InvoicePriceAdjustment } from '../InvoicePriceAdjustment';

const items = Array.from({ length: 7 }, (_, i) => ({ sourceItemId: `item-${i}`, productVariantId: `variant-${i}`, name: `Barang sintetis ${i + 1}`, unit: 'PCS', quantity: '1', availableQuantity: '1', netAmount: '100', taxAmount: '0', netUnitPrice: '100', activeAdjustment: false, revenueAccountId: i < 2 ? 'revenue-a' : 'revenue-b' }));
const context = { invoiceId: 'invoice', invoiceNumber: 'INV-SYNTHETIC-MULTI', remaining: '700', sourceFingerprint: 'a'.repeat(64), sourceLabel: 'Snapshot invoice asal', sourceError: null, items, history: [] };
beforeEach(() => { vi.clearAllMocks(); m.load.mockResolvedValue({ success: true, data: context }); m.post.mockResolvedValue({ success: true, data: { id: 'adjustment' } }); });
describe('seven-item multi-account price dropdown', () => {
    it('shows seven enabled invoice items and submits item identity, not a client-controlled account', async () => {
        render(<InvoicePriceAdjustment invoiceId="invoice" />);
        fireEvent.click(screen.getByRole('button', { name: 'Sesuaikan Harga' }));
        const select = await screen.findByLabelText('Barang yang disesuaikan');
        const options = within(select).getAllByRole('option').slice(1);
        expect(options).toHaveLength(7);
        options.forEach((option, i) => { expect(option.textContent).toContain(`Barang sintetis ${i + 1}`); expect(option).toHaveProperty('disabled', false); });
        fireEvent.change(select, { target: { value: 'item-6' } });
        fireEvent.change(screen.getByLabelText('Qty yang terdampak'), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText('Harga netto baru per unit (Rp, sebelum pajak)'), { target: { value: '90' } });
        expect(screen.getByText(/Sisa setelah penyesuaian/).textContent).toContain('690,00');
        fireEvent.change(screen.getByLabelText('Alasan penyesuaian / pembalikan'), { target: { value: 'Kesepakatan harga sintetis' } });
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi & posting penyesuaian' }));
        await waitFor(() => expect(m.post).toHaveBeenCalledOnce());
        expect(m.post.mock.calls[0][0]).toMatchObject({ sourceItemId: 'item-6', quantity: '1', newNetUnitPrice: '90', sourceFingerprint: context.sourceFingerprint });
        expect(m.post.mock.calls[0][0]).not.toHaveProperty('revenueAccountId');
        await screen.findByText(/Penyesuaian terposting/);
    });
});
