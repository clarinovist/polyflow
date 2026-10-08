// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    update: vi.fn(),
    refresh: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
}));

vi.mock('@/actions/finance/invoice', () => ({
    updateDraftSalesInvoiceDate: mocks.update,
}));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('sonner', () => ({
    toast: { success: mocks.success, error: mocks.error },
}));

import { EditDraftSalesInvoiceDateDialog } from '../EditDraftSalesInvoiceDateDialog';

const invoice = {
    id: 'inv-1',
    invoiceNumber: '4/INV/IX/2026',
    invoiceDate: new Date('2026-09-27T17:00:00.000Z'),
    dueDate: new Date('2026-10-27T17:00:00.000Z'),
    termOfPaymentDays: 30,
};

describe('EditDraftSalesInvoiceDateDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.update.mockResolvedValue({ success: true });
    });

    it('requires a changed date and audit reason before saving', () => {
        render(
            <EditDraftSalesInvoiceDateDialog
                open
                onOpenChange={vi.fn()}
                invoice={invoice}
            />,
        );
        const save = screen.getByRole('button', {
            name: 'Simpan Tanggal Invoice',
        }) as HTMLButtonElement;
        expect(save.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Tanggal Invoice Baru'), {
            target: { value: '2026-10-05' },
        });
        fireEvent.change(screen.getByLabelText('Alasan Perubahan'), {
            target: { value: 'Barang diambil pelanggan' },
        });
        expect(save.disabled).toBe(false);
    });

    it('submits expected state for concurrency protection and refreshes', async () => {
        const onOpenChange = vi.fn();
        render(
            <EditDraftSalesInvoiceDateDialog
                open
                onOpenChange={onOpenChange}
                invoice={invoice}
            />,
        );
        fireEvent.change(screen.getByLabelText('Tanggal Invoice Baru'), {
            target: { value: '2026-10-05' },
        });
        fireEvent.change(screen.getByLabelText('Alasan Perubahan'), {
            target: { value: 'Barang diambil pelanggan' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'Simpan Tanggal Invoice' }),
        );
        await waitFor(() =>
            expect(mocks.update).toHaveBeenCalledWith('inv-1', {
                invoiceDate: '2026-10-05',
                expectedInvoiceDate: '2026-09-28',
                expectedInvoiceNumber: '4/INV/IX/2026',
                reason: 'Barang diambil pelanggan',
            }),
        );
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(mocks.refresh).toHaveBeenCalled();
    });

    it('keeps the dialog open when the server rejects the mutation', async () => {
        mocks.update.mockResolvedValue({
            success: false,
            error: 'Periode target ditutup',
        });
        const onOpenChange = vi.fn();
        render(
            <EditDraftSalesInvoiceDateDialog
                open
                onOpenChange={onOpenChange}
                invoice={invoice}
            />,
        );
        fireEvent.change(screen.getByLabelText('Tanggal Invoice Baru'), {
            target: { value: '2026-10-05' },
        });
        fireEvent.change(screen.getByLabelText('Alasan Perubahan'), {
            target: { value: 'Barang diambil pelanggan' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'Simpan Tanggal Invoice' }),
        );
        await waitFor(() =>
            expect(mocks.error).toHaveBeenCalledWith('Periode target ditutup'),
        );
        expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
});
