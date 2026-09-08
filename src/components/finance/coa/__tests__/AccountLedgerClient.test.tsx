// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountLedgerClient } from '../AccountLedgerClient';
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams(),
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const ledgerData = {
    account: { id: 'account', code: '60000', name: 'Expense', type: 'EXPENSE', category: 'EXPENSE', parent: null },
    entries: [{ id: 'first', date: '2026-07-31T17:00:00Z', entryNumber: 'JE-001', description: 'Boundary payment', reference: null, referenceType: null, debit: 30, credit: 0, balance: 30 }],
    summary: { beginningBalance: 0, totalDebit: 30, totalCredit: 0, endingBalance: 30 },
};
const initialDateRange = { from: '2026-08-01', to: '2026-08-31' };
describe('AccountLedgerClient applied dates', () => {
    it('syncs back/forward dates without closing the picker or clearing search', () => {
        const view = render(<AccountLedgerClient ledgerData={ledgerData} initialDateRange={initialDateRange} />);
        const search = screen.getByPlaceholderText(/Cari keterangan/);
        fireEvent.change(search, { target: { value: 'boundary' } });
        fireEvent.click(screen.getByRole('button', { name: /Agt 01, 2026/ }));
        fireEvent.click(document.querySelector('[data-day="2026-08-10"] button')!);
        view.rerender(<AccountLedgerClient ledgerData={ledgerData} initialDateRange={{ from: '2026-07-01', to: '2026-07-31' }} />);
        expect(screen.getByRole('button', { name: /Jul 01, 2026.*Jul 31, 2026/ })).toBeTruthy();
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(screen.getByText('Juli 2026')).toBeTruthy();
        expect((search as HTMLInputElement).value).toBe('boundary');
        view.rerender(<AccountLedgerClient ledgerData={ledgerData} initialDateRange={initialDateRange} />);
        expect(screen.getByRole('button', { name: /Agt 01, 2026.*Agt 31, 2026/ })).toBeTruthy();
    });
    it('exports the same WIB date as the table', async () => {
        const createObjectURL = vi.fn((_blob: Blob) => 'blob:ledger-test');
        vi.stubGlobal('URL', class extends URL {
            static createObjectURL = createObjectURL;
            static revokeObjectURL = vi.fn();
        });
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        render(<AccountLedgerClient ledgerData={ledgerData} initialDateRange={initialDateRange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
        const blob = createObjectURL.mock.calls[0][0];
        const csv = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsText(blob);
        });
        expect(csv).toContain('"2026-08-01","JE-001"');
    });
    it('searches entries without changing the summary', () => {
        render(<AccountLedgerClient ledgerData={ledgerData} initialDateRange={initialDateRange} />);
        fireEvent.change(screen.getByPlaceholderText(/Cari keterangan/), { target: { value: 'missing' } });
        expect(screen.getByText('Tidak ada transaksi cocok dengan pencarian')).toBeTruthy();
        expect(screen.getByText('Total Debit')).toBeTruthy();
        fireEvent.change(screen.getByPlaceholderText(/Cari keterangan/), { target: { value: 'je-001' } });
        expect(screen.getByText('Boundary payment')).toBeTruthy();
    });
    it('shows the applied range and journal date in WIB', () => {
        render(<AccountLedgerClient ledgerData={ledgerData} initialDateRange={initialDateRange} />);
        expect(screen.getByText('01 Aug 2026')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Agt 01, 2026.*Agt 31, 2026/ })).toBeTruthy();
    });
    it('navigates through the real date filter without changing ledger totals', () => {
        render(<AccountLedgerClient ledgerData={ledgerData} initialDateRange={initialDateRange} />);
        fireEvent.click(screen.getByRole('button', { name: /Agt 01, 2026/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Bulan Ini' }));
        expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/finance\/coa\/account\?startDate=\d{4}-\d{2}-01&endDate=/));
        expect(screen.getByText('Boundary payment')).toBeTruthy();
    });
});
