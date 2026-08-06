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

const mockVerifyPurchaseRemittanceAction = vi.fn();
const mockRejectPurchaseRemittanceAction = vi.fn();
const mockListPurchaseRemittancesForVerificationAction = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockToastWarning = vi.fn();

vi.mock('@/actions/purchasing/purchase-remittance', () => ({
    verifyPurchaseRemittanceAction: (...args: unknown[]) =>
        mockVerifyPurchaseRemittanceAction(...args),
    rejectPurchaseRemittanceAction: (...args: unknown[]) =>
        mockRejectPurchaseRemittanceAction(...args),
    listPurchaseRemittancesForVerificationAction: (...args: unknown[]) =>
        mockListPurchaseRemittancesForVerificationAction(...args),
}));

vi.mock('sonner', () => ({
    toast: {
        success: (...args: unknown[]) => mockToastSuccess(...args),
        error: (...args: unknown[]) => mockToastError(...args),
        warning: (...args: unknown[]) => mockToastWarning(...args),
    },
}));

import {
    PurchaseRemittanceVerificationQueue,
    type PurchaseRemittanceQueueRow,
} from '../PurchaseRemittanceVerificationQueue';

function makeRow(
    overrides: Partial<PurchaseRemittanceQueueRow> = {},
): PurchaseRemittanceQueueRow {
    return {
        id: 'prem-1',
        remittanceNumber: 'PREM-2026-08-0001',
        paidAt: new Date('2026-08-05'),
        totalAmount: 500000,
        status: 'PENDING',
        notes: null,
        user: { id: 'wh-1', name: 'Warehouse A' },
        items: [
            {
                id: 'pri-1',
                purchaseInvoiceId: 'pinv-1',
                amount: 500000,
                method: 'Cash',
                referenceNumber: null,
                proofUrl: '/api/images/tenant/remittance-proof/wh-1/1.jpg',
                proofOriginalName: 'kwitansi.jpg',
                proofMimeType: 'image/jpeg',
                purchaseInvoice: { invoiceNumber: 'PINV/2026/0001' },
            },
        ],
        ...overrides,
    };
}

describe('PurchaseRemittanceVerificationQueue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockListPurchaseRemittancesForVerificationAction.mockResolvedValue({
            success: true,
            data: [],
        });
    });

    it('shows empty state when no remittances', () => {
        render(
            <PurchaseRemittanceVerificationQueue initialRemittances={[]} />,
        );
        expect(
            screen.getByText(/tidak ada setoran pembayaran supplier/i),
        ).toBeDefined();
    });

    it('renders remittance details with proof link', () => {
        render(
            <PurchaseRemittanceVerificationQueue
                initialRemittances={[makeRow()]}
            />,
        );
        expect(screen.getByText('PREM-2026-08-0001')).toBeDefined();
        expect(screen.getByText(/warehouse a/i)).toBeDefined();
        expect(screen.getByText('PINV/2026/0001')).toBeDefined();
    });

    it('verify success calls action and refreshes list', async () => {
        mockVerifyPurchaseRemittanceAction.mockResolvedValue({
            success: true,
            data: { successCount: 1, failedCount: 0 },
        });

        render(
            <PurchaseRemittanceVerificationQueue
                initialRemittances={[makeRow()]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /verifikasi/i }));

        await waitFor(() => {
            expect(mockVerifyPurchaseRemittanceAction).toHaveBeenCalledWith({
                remittanceId: 'prem-1',
            });
        });
        await waitFor(() => {
            expect(mockToastSuccess).toHaveBeenCalled();
            expect(
                mockListPurchaseRemittancesForVerificationAction,
            ).toHaveBeenCalledWith({ status: 'PENDING' });
        });
    });

    it('verify partial failure shows warning toast', async () => {
        mockVerifyPurchaseRemittanceAction.mockResolvedValue({
            success: true,
            data: { successCount: 0, failedCount: 1 },
        });

        render(
            <PurchaseRemittanceVerificationQueue
                initialRemittances={[makeRow()]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /verifikasi/i }));

        await waitFor(() => {
            expect(mockToastWarning).toHaveBeenCalled();
        });
    });

    it('verify error shows error toast', async () => {
        mockVerifyPurchaseRemittanceAction.mockResolvedValue({
            success: false,
            error: 'Gagal verifikasi',
        });

        render(
            <PurchaseRemittanceVerificationQueue
                initialRemittances={[makeRow()]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /verifikasi/i }));

        await waitFor(() => {
            expect(mockToastError).toHaveBeenCalledWith('Gagal verifikasi');
        });
    });

    it('reject requires reason before confirming', async () => {
        render(
            <PurchaseRemittanceVerificationQueue
                initialRemittances={[makeRow()]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /^tolak$/i }));

        fireEvent.click(
            screen.getByRole('button', { name: /konfirmasi tolak/i }),
        );

        expect(mockToastError).toHaveBeenCalledWith(
            'Alasan penolakan wajib diisi',
        );
        expect(mockRejectPurchaseRemittanceAction).not.toHaveBeenCalled();
    });

    it('reject with reason calls action and refreshes', async () => {
        mockRejectPurchaseRemittanceAction.mockResolvedValue({ success: true });

        render(
            <PurchaseRemittanceVerificationQueue
                initialRemittances={[makeRow()]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /^tolak$/i }));

        const textarea = screen.getByPlaceholderText(/alasan penolakan/i);
        fireEvent.change(textarea, {
            target: { value: 'Kwitansi tidak jelas' },
        });

        fireEvent.click(
            screen.getByRole('button', { name: /konfirmasi tolak/i }),
        );

        await waitFor(() => {
            expect(mockRejectPurchaseRemittanceAction).toHaveBeenCalledWith({
                remittanceId: 'prem-1',
                reason: 'Kwitansi tidak jelas',
            });
        });
        await waitFor(() => {
            expect(mockToastSuccess).toHaveBeenCalled();
        });
    });

    it('renders "Tanpa bukti" when item has no proof', () => {
        render(
            <PurchaseRemittanceVerificationQueue
                initialRemittances={[
                    makeRow({
                        items: [
                            {
                                id: 'pri-2',
                                purchaseInvoiceId: 'pinv-2',
                                amount: 200000,
                                method: 'Transfer',
                                referenceNumber: null,
                                proofUrl: null,
                                proofOriginalName: null,
                                proofMimeType: null,
                                purchaseInvoice: {
                                    invoiceNumber: 'PINV/2026/0002',
                                },
                            },
                        ],
                    }),
                ]}
            />,
        );
        expect(screen.getByText(/tanpa bukti/i)).toBeDefined();
    });
});
