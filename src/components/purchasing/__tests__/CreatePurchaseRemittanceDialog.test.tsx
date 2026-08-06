// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
Element.prototype.releasePointerCapture = vi.fn();

const mockCreatePurchaseRemittanceAction = vi.fn();
const mockToast = vi.fn();

vi.mock('@/actions/purchasing/purchase-remittance', () => ({
    createPurchaseRemittanceAction: (...args: unknown[]) =>
        mockCreatePurchaseRemittanceAction(...args),
}));

vi.mock('@/hooks/use-toast', () => ({
    useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/lib/media/compress-image', () => ({
    compressImageForUpload: async (file: File) => file,
}));

import { CreatePurchaseRemittanceDialog } from '../CreatePurchaseRemittanceDialog';

const invoices = [
    {
        id: 'pinv-1',
        invoiceNumber: 'PINV/2026/0001',
        totalAmount: 1000000,
        paidAmount: 0,
        purchaseOrder: {
            orderNumber: 'PO-0001',
            supplier: { name: 'Supplier A' },
        },
    },
];

function selectInvoice() {
    const combos = screen.getAllByRole('combobox');
    fireEvent.click(combos[0]);
    fireEvent.click(screen.getByText('PINV/2026/0001'));
}

describe('CreatePurchaseRemittanceDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreatePurchaseRemittanceAction.mockResolvedValue({
            success: true,
            data: { id: 'prem-1' },
        });
        global.fetch = vi.fn();
    });

    it('renders title when open', () => {
        render(
            <CreatePurchaseRemittanceDialog
                open={true}
                onOpenChange={() => {}}
                invoices={invoices}
            />,
        );
        expect(
            screen.getByRole('heading', {
                name: 'Ajukan Pembayaran Supplier',
            }),
        ).toBeDefined();
    });

    it('submit button disabled until invoice selected', () => {
        render(
            <CreatePurchaseRemittanceDialog
                open={true}
                onOpenChange={() => {}}
                invoices={invoices}
            />,
        );
        const submitBtn = screen.getByRole('button', {
            name: /ajukan setoran/i,
        });
        expect(submitBtn.hasAttribute('disabled')).toBe(true);
    });

    it('selecting invoice enables submit and submits without proof when no photo uploaded', async () => {
        render(
            <CreatePurchaseRemittanceDialog
                open={true}
                onOpenChange={() => {}}
                invoices={invoices}
            />,
        );

        selectInvoice();

        const amountInput = screen.getByLabelText(/jumlah setoran/i);
        fireEvent.change(amountInput, { target: { value: '500000' } });

        const submitBtn = screen.getByRole('button', {
            name: /ajukan setoran/i,
        });
        expect(submitBtn.hasAttribute('disabled')).toBe(false);

        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(mockCreatePurchaseRemittanceAction).toHaveBeenCalled();
        });

        const callArg = mockCreatePurchaseRemittanceAction.mock
            .calls[0]?.[0] as Record<string, unknown>;
        const items = callArg.items as Record<string, unknown>[];
        expect(items[0].purchaseInvoiceId).toBe('pinv-1');
        expect(items[0].amount).toBe(500000);
        expect(items[0].proofUrl).toBeUndefined();
    });

    it('rejects amount exceeding remaining balance without calling action', async () => {
        render(
            <CreatePurchaseRemittanceDialog
                open={true}
                onOpenChange={() => {}}
                invoices={invoices}
            />,
        );

        selectInvoice();

        const amountInput = screen.getByLabelText(/jumlah setoran/i);
        fireEvent.change(amountInput, { target: { value: '5000000' } });

        // amount input has native `max` — dispatch submit directly to bypass
        // jsdom's HTML5 constraint validation and exercise our own check.
        const form = document.querySelector('form') as HTMLFormElement;
        fireEvent.submit(form);

        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledWith(
                expect.objectContaining({ variant: 'destructive' }),
            );
        });
        expect(mockCreatePurchaseRemittanceAction).not.toHaveBeenCalled();
    });

    it('uploads photo then includes proof fields in submitted item', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                url: '/api/images/tenant/remittance-proof/wh-1/1.jpg',
                key: 'tenant/remittance-proof/wh-1/1.jpg',
                originalName: 'kwitansi.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: 12345,
            }),
        });

        render(
            <CreatePurchaseRemittanceDialog
                open={true}
                onOpenChange={() => {}}
                invoices={invoices}
            />,
        );

        selectInvoice();

        const amountInput = screen.getByLabelText(/jumlah setoran/i);
        fireEvent.change(amountInput, { target: { value: '500000' } });

        const uploadBtn = screen.getByRole('button', {
            name: /upload bukti bayar/i,
        });
        fireEvent.click(uploadBtn);

        const fileInput = document.querySelector(
            'input[type="file"]',
        ) as HTMLInputElement;
        const file = new File(['x'], 'kwitansi.jpg', { type: 'image/jpeg' });
        fireEvent.change(fileInput, { target: { files: [file] } });

        await waitFor(() => {
            expect(screen.getByText('kwitansi.jpg')).toBeDefined();
        });

        fireEvent.click(
            screen.getByRole('button', { name: /ajukan setoran/i }),
        );

        await waitFor(() => {
            expect(mockCreatePurchaseRemittanceAction).toHaveBeenCalled();
        });

        expect(global.fetch).toHaveBeenCalledWith(
            '/api/upload/purchase-remittance-proof',
            expect.objectContaining({ method: 'POST' }),
        );

        const callArg = mockCreatePurchaseRemittanceAction.mock
            .calls[0]?.[0] as Record<string, unknown>;
        const items = callArg.items as Record<string, unknown>[];
        expect(items[0].proofUrl).toBe(
            '/api/images/tenant/remittance-proof/wh-1/1.jpg',
        );
        expect(items[0].proofStorageKey).toBe(
            'tenant/remittance-proof/wh-1/1.jpg',
        );
    });
});
