// @vitest-environment jsdom

import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ cancel: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: m.refresh, push: vi.fn() }),
}));
vi.mock('@/actions/sales/expense-claims', () => ({
    cancelExpenseClaim: m.cancel,
}));

import type { ClaimListItem } from '@/lib/sales/expense-claim-ui';
import { ClaimHistoryList } from '../ClaimHistoryList';

function claim(overrides: Partial<ClaimListItem> = {}): ClaimListItem {
    return {
        id: 'claim-1',
        claimNumber: 'RMB-202611-001',
        expenseDate: '2026-11-23T17:00:00.000Z', // 24 Nov 2026 WIB
        category: 'BBM',
        amount: 125000,
        description: 'Bensin kunjungan',
        receiptUrl: '/api/images/tenant/expense-receipt/user/1.jpg',
        status: 'SUBMITTED',
        rejectionReason: null,
        salesVisit: null,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    m.cancel.mockResolvedValue({ success: true, data: {} });
});
afterEach(cleanup);

describe('ClaimHistoryList', () => {
    it('shows an empty state when there are no claims', () => {
        render(<ClaimHistoryList claims={[]} />);
        expect(screen.getByText('Belum ada klaim')).toBeTruthy();
    });

    it('renders number, category, amount, WIB date, linked customer and receipt link', () => {
        render(
            <ClaimHistoryList
                claims={[
                    claim({
                        salesVisit: { customer: { name: 'Toko Contoh' } },
                    }),
                ]}
            />,
        );

        expect(screen.getByText('RMB-202611-001')).toBeTruthy();
        expect(screen.getByText(/BBM/)).toBeTruthy();
        expect(screen.getByText(/125\.000/)).toBeTruthy();
        expect(screen.getByText(/24 Nov 2026 · Toko Contoh/)).toBeTruthy();
        const link = screen.getByRole('link', { name: /Lihat nota/ });
        expect(link.getAttribute('href')).toBe(
            '/api/images/tenant/expense-receipt/user/1.jpg',
        );
        expect(link.getAttribute('target')).toBe('_blank');
    });

    it.each([
        ['SUBMITTED', 'Menunggu'],
        ['APPROVED', 'Disetujui'],
        ['REJECTED', 'Ditolak'],
        ['PAID', 'Dibayar'],
        ['CANCELLED', 'Dibatalkan'],
    ])('labels a %s claim as %s', (status, label) => {
        render(<ClaimHistoryList claims={[claim({ status })]} />);
        expect(screen.getByText(label)).toBeTruthy();
    });

    it('shows the rejection reason on a rejected claim', () => {
        render(
            <ClaimHistoryList
                claims={[
                    claim({
                        status: 'REJECTED',
                        rejectionReason: 'Nota tidak terbaca',
                    }),
                ]}
            />,
        );
        expect(
            screen.getByText('Alasan ditolak: Nota tidak terbaca'),
        ).toBeTruthy();
    });

    it('offers cancel only for SUBMITTED claims', () => {
        render(
            <ClaimHistoryList
                claims={[
                    claim({ id: 'a', status: 'SUBMITTED' }),
                    claim({ id: 'b', status: 'APPROVED' }),
                    claim({ id: 'c', status: 'REJECTED' }),
                    claim({ id: 'd', status: 'PAID' }),
                    claim({ id: 'e', status: 'CANCELLED' }),
                ]}
            />,
        );
        expect(screen.getAllByRole('button', { name: 'Batalkan' })).toHaveLength(
            1,
        );
    });

    it('asks for confirmation, then cancels and refreshes the list', async () => {
        render(<ClaimHistoryList claims={[claim()]} />);

        fireEvent.click(screen.getByRole('button', { name: 'Batalkan' }));
        expect(m.cancel).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Ya, batalkan' }));

        await waitFor(() => expect(m.cancel).toHaveBeenCalledWith('claim-1'));
        await waitFor(() => expect(m.refresh).toHaveBeenCalledOnce());
    });

    it('does not cancel when the user declines the confirmation', () => {
        render(<ClaimHistoryList claims={[claim()]} />);

        fireEvent.click(screen.getByRole('button', { name: 'Batalkan' }));
        fireEvent.click(screen.getByRole('button', { name: 'Tidak' }));

        expect(m.cancel).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Batalkan' })).toBeTruthy();
    });

    it('shows the server error when cancelling fails', async () => {
        m.cancel.mockResolvedValueOnce({
            success: false,
            error: 'Klaim sudah diproses',
            code: 'BUSINESS_RULE',
        });
        render(<ClaimHistoryList claims={[claim()]} />);

        fireEvent.click(screen.getByRole('button', { name: 'Batalkan' }));
        fireEvent.click(screen.getByRole('button', { name: 'Ya, batalkan' }));

        expect((await screen.findByRole('alert')).textContent).toBe(
            'Klaim sudah diproses',
        );
        expect(m.refresh).not.toHaveBeenCalled();
    });

    it('shows a friendly message when the cancel call throws', async () => {
        m.cancel.mockRejectedValueOnce(new Error('offline'));
        render(<ClaimHistoryList claims={[claim()]} />);

        fireEvent.click(screen.getByRole('button', { name: 'Batalkan' }));
        fireEvent.click(screen.getByRole('button', { name: 'Ya, batalkan' }));

        expect((await screen.findByRole('alert')).textContent).toBe(
            'Gagal membatalkan klaim. Periksa koneksi lalu coba lagi.',
        );
    });
});
