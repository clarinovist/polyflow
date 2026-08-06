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

const mockCreateRemittanceAction = vi.fn();
const mockToast = vi.fn();

vi.mock('@/actions/sales/collection', () => ({
    createRemittanceAction: (...args: unknown[]) =>
        mockCreateRemittanceAction(...args),
}));

vi.mock('@/hooks/use-toast', () => ({
    useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/lib/media/compress-image', () => ({
    compressImageForUpload: async (file: File) => file,
}));

import { CreateRemittanceDialog } from '../CreateRemittanceDialog';

const invoices = [
    {
        id: 'inv-1',
        invoiceNumber: 'INV/2026/0001',
        totalAmount: 1000000,
        paidAmount: 0,
        salesOrder: {
            orderNumber: 'SO-0001',
            customer: { name: 'Customer A' },
        },
    },
];

function selectInvoice() {
    const combos = screen.getAllByRole('combobox');
    fireEvent.click(combos[0]);
    fireEvent.click(screen.getByText('INV/2026/0001'));
}

describe('CreateRemittanceDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateRemittanceAction.mockResolvedValue({
            success: true,
            data: { id: 'rem-1' },
        });
        global.fetch = vi.fn();
    });

    it('renders title when open', () => {
        render(
            <CreateRemittanceDialog
                open={true}
                onOpenChange={() => {}}
                invoices={invoices}
            />,
        );
        expect(screen.getByRole('heading', { name: 'Ajukan Setoran' })).toBeDefined();
    });

    it('submit button disabled until invoice selected', () => {
        render(
            <CreateRemittanceDialog
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
            <CreateRemittanceDialog
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
            expect(mockCreateRemittanceAction).toHaveBeenCalled();
        });

        const callArg = mockCreateRemittanceAction.mock
            .calls[0]?.[0] as Record<string, unknown>;
        const items = callArg.items as Record<string, unknown>[];
        expect(items[0].invoiceId).toBe('inv-1');
        expect(items[0].amount).toBe(500000);
        expect(items[0].proofUrl).toBeUndefined();
    });

    it('rejects amount exceeding remaining balance without calling action', async () => {
        render(
            <CreateRemittanceDialog
                open={true}
                onOpenChange={() => {}}
                invoices={invoices}
            />,
        );

        selectInvoice();

        const amountInput = screen.getByLabelText(/jumlah setoran/i);
        fireEvent.change(amountInput, { target: { value: '5000000' } });

        // The amount input has a native `max` attribute (remaining balance),
        // so clicking the submit button triggers jsdom's HTML5 constraint
        // validation and blocks the submit event before it reaches our
        // handler. Dispatch `submit` directly to exercise our own
        // over-the-remaining-balance validation instead. Dialog content is
        // portalled to document.body, so query there rather than container.
        const form = document.querySelector('form') as HTMLFormElement;
        fireEvent.submit(form);

        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledWith(
                expect.objectContaining({ variant: 'destructive' }),
            );
        });
        expect(mockCreateRemittanceAction).not.toHaveBeenCalled();
    });

    it('uploads photo then includes proof fields in submitted item', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                url: '/api/images/tenant/remittance-proof/u1/1.jpg',
                key: 'tenant/remittance-proof/u1/1.jpg',
                originalName: 'bukti.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: 12345,
            }),
        });

        render(
            <CreateRemittanceDialog
                open={true}
                onOpenChange={() => {}}
                invoices={invoices}
            />,
        );

        selectInvoice();

        const amountInput = screen.getByLabelText(/jumlah setoran/i);
        fireEvent.change(amountInput, { target: { value: '500000' } });

        const uploadBtn = screen.getByRole('button', {
            name: /upload screenshot bukti transfer/i,
        });
        fireEvent.click(uploadBtn);

        const fileInput = document.querySelector(
            'input[type="file"]',
        ) as HTMLInputElement;
        const file = new File(['x'], 'bukti.jpg', { type: 'image/jpeg' });
        fireEvent.change(fileInput, { target: { files: [file] } });

        await waitFor(() => {
            expect(screen.getByText('bukti.jpg')).toBeDefined();
        });

        fireEvent.click(
            screen.getByRole('button', { name: /ajukan setoran/i }),
        );

        await waitFor(() => {
            expect(mockCreateRemittanceAction).toHaveBeenCalled();
        });

        const callArg = mockCreateRemittanceAction.mock
            .calls[0]?.[0] as Record<string, unknown>;
        const items = callArg.items as Record<string, unknown>[];
        expect(items[0].proofUrl).toBe(
            '/api/images/tenant/remittance-proof/u1/1.jpg',
        );
        expect(items[0].proofStorageKey).toBe(
            'tenant/remittance-proof/u1/1.jpg',
        );
    });
});
