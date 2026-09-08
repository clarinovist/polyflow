// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BalanceSheetReport } from '../BalanceSheetReport';
import type { BalanceSheetAccount } from '../balance-sheet-view';

vi.mock('@/components/finance/Rupiah', () => ({
    Rupiah: ({ value }: { value: number }) => <span>{value}</span>,
}));

const assets: BalanceSheetAccount[] = [
    {
        id: 'asset-root',
        code: '1-0000',
        name: 'Aset Lancar',
        netBalance: 10,
        parentId: null,
    },
    {
        id: 'trade-receivable',
        code: '1-1101',
        name: 'Piutang Dagang',
        netBalance: 20,
        parentId: 'asset-root',
    },
    {
        id: 'customer-receivable',
        code: '1-1101-01',
        name: 'Piutang Pelanggan A',
        netBalance: 30,
        parentId: 'trade-receivable',
    },
];

const liabilities: BalanceSheetAccount[] = [
    {
        id: 'trade-payable',
        code: '2-1101',
        name: 'Hutang Dagang',
        netBalance: 40,
        parentId: null,
    },
];

const data = {
    assets,
    liabilities,
    equity: [],
    totalAssets: 60,
    totalLiabilities: 40,
    totalEquity: 0,
    unpostedEarnings: 20,
    totalLiabilitiesAndEquity: 60,
};

describe('BalanceSheetReport', () => {
    it('defaults to detail and links every visible account to the same WIB cutoff', () => {
        render(<BalanceSheetReport data={data} asOfDate="2026-09-08" />);

        expect(screen.getByText('Neraca (Detail)')).toBeTruthy();
        const accountLink = screen.getByRole('link', {
            name: /1-1101-01.*Piutang Pelanggan A/,
        });
        expect(accountLink.getAttribute('href')).toBe(
            '/finance/reports/general-ledger?account=customer-receivable&to=2026-09-08',
        );
        expect(
            screen.getByText(/bandingkan saldo akhir rekap pada tanggal yang sama/i),
        ).toBeTruthy();
        expect(screen.getByText(/bukan total seluruh kewajiban/i)).toBeTruthy();
    });

    it('searches name or code case-insensitively without changing report totals', () => {
        render(<BalanceSheetReport data={data} asOfDate="2026-09-08" />);
        const totalBefore = screen.getByText('TOTAL ASET').closest('tr')!
            .textContent;

        fireEvent.change(
            screen.getByPlaceholderText('Cari nama atau kode akun...'),
            { target: { value: 'HUTANG dagang' } },
        );

        expect(screen.getByText('Hutang Dagang')).toBeTruthy();
        expect(screen.queryByText('Piutang Pelanggan A')).toBeNull();
        expect(screen.getByText('TOTAL ASET').closest('tr')!.textContent).toBe(
            totalBefore,
        );
    });

    it('expands nested summary groups from the complete flat account list', () => {
        render(<BalanceSheetReport data={data} asOfDate="2026-09-08" />);

        fireEvent.click(screen.getByRole('switch', { name: 'Ringkas' }));
        expect(screen.getByText('Neraca (Ringkas)')).toBeTruthy();
        expect(screen.queryByText('Piutang Pelanggan A')).toBeNull();

        const assetGroup = screen.getByRole('button', {
            name: 'Buka rincian Aset Lancar',
        });
        expect(assetGroup.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(assetGroup);
        expect(assetGroup.getAttribute('aria-expanded')).toBe('true');
        const tradeGroup = screen.getByRole('button', {
            name: 'Buka rincian Piutang Dagang',
        });
        expect(tradeGroup).toBeTruthy();
        fireEvent.click(tradeGroup);

        const customerRow = screen.getByText('Piutang Pelanggan A').closest('tr')!;
        expect(within(customerRow).getByText('1-1101-01')).toBeTruthy();
    });
});
