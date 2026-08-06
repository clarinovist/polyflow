// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const { mockToastSuccess, mockToastError, mockGetPaymentBanks, mockUpdatePaymentBanks, mockGetChartOfAccounts } =
    vi.hoisted(() => ({
        mockToastSuccess: vi.fn(),
        mockToastError: vi.fn(),
        mockGetPaymentBanks: vi.fn(),
        mockUpdatePaymentBanks: vi.fn(),
        mockGetChartOfAccounts: vi.fn(),
    }));

vi.mock('sonner', () => ({
    toast: {
        success: (...args: unknown[]) => mockToastSuccess(...args),
        error: (...args: unknown[]) => mockToastError(...args),
    },
}));

vi.mock('@/actions/finance/payment-banks-actions', () => ({
    getPaymentBanks: (...args: unknown[]) => mockGetPaymentBanks(...args),
    updatePaymentBanks: (...args: unknown[]) => mockUpdatePaymentBanks(...args),
}));

vi.mock('@/actions/finance/accounting', () => ({
    getChartOfAccounts: (...args: unknown[]) => mockGetChartOfAccounts(...args),
}));

vi.mock('@/components/ui/select', () => ({
    Select: ({ onValueChange, children }: any) => (
        <div data-testid="gl-select">
            <button
                data-testid="gl-select-pick"
                onClick={() => onValueChange('acc-bri-1')}
            >
                Pick BRI Account
            </button>
            {children}
        </div>
    ),
    SelectTrigger: ({ children }: any) => <div>{children}</div>,
    SelectValue: () => <span />,
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ children }: any) => <div>{children}</div>,
}));

import { PaymentBanksSettings } from '../PaymentBanksSettings';

const EXISTING_BANKS = [
    { key: 'BCA', name: 'BCA', holder: 'PT Melindo', account: '111' },
    { key: 'MANDIRI', name: 'Mandiri', holder: 'PT Melindo', account: '222' },
];

const COA_ACCOUNTS = [
    { id: 'acc-bri-1', code: '11140', name: 'Bank BRI', isActive: true, isCashAccount: true },
];

describe('PaymentBanksSettings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetPaymentBanks.mockResolvedValue({ success: true, data: EXISTING_BANKS });
        mockGetChartOfAccounts.mockResolvedValue({ success: true, data: COA_ACCOUNTS });
    });

    it('loads and displays existing BCA/Mandiri rekening', async () => {
        render(<PaymentBanksSettings canEdit />);

        await waitFor(() => {
            expect(screen.getByDisplayValue('111')).toBeTruthy();
        });
        expect(screen.getByDisplayValue('222')).toBeTruthy();
        expect(screen.getAllByDisplayValue('PT Melindo')).toHaveLength(2);
    });

    it('blocks save when a new bank has no GL account selected', async () => {
        render(<PaymentBanksSettings canEdit />);
        await waitFor(() => screen.getByDisplayValue('111'));

        fireEvent.click(screen.getByText('Tambah Bank'));

        fireEvent.change(screen.getByPlaceholderText('Nama bank (mis. BRI)'), {
            target: { value: 'BRI' },
        });
        const accountInputs = screen.getAllByPlaceholderText('Nomor rekening');
        fireEvent.change(accountInputs[accountInputs.length - 1], {
            target: { value: '555' },
        });

        fireEvent.click(screen.getByText('Simpan Rekening Bank'));

        await waitFor(() => {
            expect(mockToastError).toHaveBeenCalledWith(
                expect.stringContaining('akun COA'),
            );
        });
        expect(mockUpdatePaymentBanks).not.toHaveBeenCalled();
    });

    it('saves a new bank with holder, account, and glAccountId once fully filled', async () => {
        mockUpdatePaymentBanks.mockResolvedValue({
            success: true,
            data: [
                ...EXISTING_BANKS,
                {
                    key: 'BRI',
                    name: 'BRI',
                    holder: 'BRI',
                    account: '555',
                    glAccountId: 'acc-bri-1',
                },
            ],
        });

        render(<PaymentBanksSettings canEdit />);
        await waitFor(() => screen.getByDisplayValue('111'));

        fireEvent.click(screen.getByText('Tambah Bank'));
        fireEvent.change(screen.getByPlaceholderText('Nama bank (mis. BRI)'), {
            target: { value: 'BRI' },
        });
        const accountInputs = screen.getAllByPlaceholderText('Nomor rekening');
        fireEvent.change(accountInputs[accountInputs.length - 1], {
            target: { value: '555' },
        });
        fireEvent.click(screen.getByTestId('gl-select-pick'));

        fireEvent.click(screen.getByText('Simpan Rekening Bank'));

        await waitFor(() => {
            expect(mockUpdatePaymentBanks).toHaveBeenCalledTimes(1);
        });
        const payload = mockUpdatePaymentBanks.mock.calls[0][0];
        expect(payload).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    key: 'BRI',
                    name: 'BRI',
                    account: '555',
                    glAccountId: 'acc-bri-1',
                }),
            ]),
        );
        expect(mockToastSuccess).toHaveBeenCalled();
    });

    it('shows a read-only notice and hides mutation controls when canEdit is false', async () => {
        render(<PaymentBanksSettings canEdit={false} />);
        await waitFor(() => screen.getByDisplayValue('111'));

        expect(screen.queryByText('Tambah Bank')).toBeNull();
        expect(screen.queryByText('Simpan Rekening Bank')).toBeNull();
        expect(screen.getByText(/Hanya Admin atau Finance/)).toBeTruthy();
    });
});
