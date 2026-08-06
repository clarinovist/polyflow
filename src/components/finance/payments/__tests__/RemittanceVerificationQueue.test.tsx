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

const mockVerifyRemittanceAction = vi.fn();
const mockRejectRemittanceAction = vi.fn();
const mockListRemittancesForVerificationAction = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockToastWarning = vi.fn();

vi.mock('@/actions/sales/collection', () => ({
    verifyRemittanceAction: (...args: unknown[]) =>
        mockVerifyRemittanceAction(...args),
    rejectRemittanceAction: (...args: unknown[]) =>
        mockRejectRemittanceAction(...args),
    listRemittancesForVerificationAction: (...args: unknown[]) =>
        mockListRemittancesForVerificationAction(...args),
}));

vi.mock('sonner', () => ({
    toast: {
        success: (...args: unknown[]) => mockToastSuccess(...args),
        error: (...args: unknown[]) => mockToastError(...args),
        warning: (...args: unknown[]) => mockToastWarning(...args),
    },
}));

import {
    RemittanceVerificationQueue,
    type RemittanceQueueRow,
} from '../RemittanceVerificationQueue';

function makeRow(overrides: Partial<RemittanceQueueRow> = {}): RemittanceQueueRow {
    return {
        id: 'rem-1',
        remittanceNumber: 'REM-2026-08-0001',
        collectedAt: new Date('2026-08-05'),
        totalAmount: 500000,
        status: 'PENDING',
        notes: null,
        user: { id: 'u1', name: 'Marketing A' },
        items: [
            {
                id: 'ri-1',
                invoiceId: 'inv-1',
                amount: 500000,
                method: 'Transfer',
                referenceNumber: null,
                proofUrl: '/api/images/tenant/remittance-proof/u1/1.jpg',
                proofOriginalName: 'bukti.jpg',
                proofMimeType: 'image/jpeg',
                invoice: { invoiceNumber: 'INV/2026/0001' },
            },
        ],
        ...overrides,
    };
}

describe('RemittanceVerificationQueue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockListRemittancesForVerificationAction.mockResolvedValue({
            success: true,
            data: [],
        });
    });

    it('shows empty state when no remittances', () => {
        render(<RemittanceVerificationQueue initialRemittances={[]} />);
        expect(
            screen.getByText(/tidak ada setoran yang menunggu verifikasi/i),
        ).toBeDefined();
    });

    it('renders remittance details with proof link', () => {
        render(
            <RemittanceVerificationQueue
                initialRemittances={[makeRow()]}
            />,
        );
        expect(screen.getByText('REM-2026-08-0001')).toBeDefined();
        expect(screen.getByText(/marketing a/i)).toBeDefined();
        expect(screen.getByText('INV/2026/0001')).toBeDefined();
    });

    it('verify success calls action and refreshes list', async () => {
        mockVerifyRemittanceAction.mockResolvedValue({
            success: true,
            data: { successCount: 1, failedCount: 0 },
        });

        render(
            <RemittanceVerificationQueue
                initialRemittances={[makeRow()]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /verifikasi/i }));

        await waitFor(() => {
            expect(mockVerifyRemittanceAction).toHaveBeenCalledWith({
                remittanceId: 'rem-1',
            });
        });
        await waitFor(() => {
            expect(mockToastSuccess).toHaveBeenCalled();
            expect(mockListRemittancesForVerificationAction).toHaveBeenCalledWith(
                { status: 'PENDING' },
            );
        });
    });

    it('verify partial failure shows warning toast', async () => {
        mockVerifyRemittanceAction.mockResolvedValue({
            success: true,
            data: { successCount: 0, failedCount: 1 },
        });

        render(
            <RemittanceVerificationQueue
                initialRemittances={[makeRow()]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /verifikasi/i }));

        await waitFor(() => {
            expect(mockToastWarning).toHaveBeenCalled();
        });
    });

    it('verify error shows error toast', async () => {
        mockVerifyRemittanceAction.mockResolvedValue({
            success: false,
            error: 'Gagal verifikasi',
        });

        render(
            <RemittanceVerificationQueue
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
            <RemittanceVerificationQueue
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
        expect(mockRejectRemittanceAction).not.toHaveBeenCalled();
    });

    it('reject with reason calls action and refreshes', async () => {
        mockRejectRemittanceAction.mockResolvedValue({ success: true });

        render(
            <RemittanceVerificationQueue
                initialRemittances={[makeRow()]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /^tolak$/i }));

        const textarea = screen.getByPlaceholderText(
            /alasan penolakan/i,
        );
        fireEvent.change(textarea, {
            target: { value: 'Bukti tidak jelas' },
        });

        fireEvent.click(
            screen.getByRole('button', { name: /konfirmasi tolak/i }),
        );

        await waitFor(() => {
            expect(mockRejectRemittanceAction).toHaveBeenCalledWith({
                remittanceId: 'rem-1',
                reason: 'Bukti tidak jelas',
            });
        });
        await waitFor(() => {
            expect(mockToastSuccess).toHaveBeenCalled();
        });
    });

    it('renders "Tanpa bukti" when item has no proof', () => {
        render(
            <RemittanceVerificationQueue
                initialRemittances={[
                    makeRow({
                        items: [
                            {
                                id: 'ri-2',
                                invoiceId: 'inv-2',
                                amount: 200000,
                                method: 'Cash',
                                referenceNumber: null,
                                proofUrl: null,
                                proofOriginalName: null,
                                proofMimeType: null,
                                invoice: { invoiceNumber: 'INV/2026/0002' },
                            },
                        ],
                    }),
                ]}
            />,
        );
        expect(screen.getByText(/tanpa bukti/i)).toBeDefined();
    });
});
