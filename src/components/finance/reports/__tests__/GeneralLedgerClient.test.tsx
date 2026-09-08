// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toBusinessDateString } from '@/lib/utils/timezone';

const {
    mockGetGeneralLedger,
    mockGetGeneralLedgerSummary,
    mockGetGeneralLedgerAccountEntries,
} = vi.hoisted(() => ({
    mockGetGeneralLedger: vi.fn(),
    mockGetGeneralLedgerSummary: vi.fn(),
    mockGetGeneralLedgerAccountEntries: vi.fn(),
}));

vi.mock('@/actions/finance/accounting', () => ({
    getGeneralLedger: (...args: unknown[]) => mockGetGeneralLedger(...args),
    getGeneralLedgerSummary: (...args: unknown[]) =>
        mockGetGeneralLedgerSummary(...args),
    getGeneralLedgerAccountEntries: (...args: unknown[]) =>
        mockGetGeneralLedgerAccountEntries(...args),
}));

vi.mock('@/components/ui/date-range-picker', () => ({
    DatePickerWithRange: ({
        onDateChange,
    }: {
        onDateChange: (range: { from: Date; to: Date }) => void;
    }) => (
        <button
            type="button"
            onClick={() =>
                onDateChange({
                    from: new Date(2026, 8, 1),
                    to: new Date(2026, 8, 30),
                })
            }
        >
            Pilih periode baru
        </button>
    ),
}));

import { GeneralLedgerClient } from '../GeneralLedgerClient';

const account = {
    id: 'acc-ap',
    code: '2-1101',
    name: 'Hutang Dagang',
    type: 'LIABILITY',
    category: 'CURRENT_LIABILITY',
    entryCount: 1,
    beginningBalance: 40,
    totalDebit: 0,
    totalCredit: 0,
    endingBalance: 40,
};

const summaryResult = (name = account.name) => ({
    success: true,
    data: {
        accounts: [{ ...account, name }],
        grandTotalDebit: 0,
        grandTotalCredit: 0,
    },
});

const detailResult = (description = 'Transaksi periode aktif') => ({
    success: true,
    data: {
        accountId: account.id,
        beginningBalance: 40,
        entries: [
            {
                date: '2026-09-08T00:00:00.000Z',
                entryNumber: 'JE-001',
                description,
                reference: null,
                referenceType: null,
                debit: 0,
                credit: 0,
                balance: 40,
            },
        ],
        totalDebit: 0,
        totalCredit: 0,
        endingBalance: 40,
    },
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function accountRow() {
    return screen.getByText(`(${account.code}) ${account.name}`).closest('tr')!;
}

describe('GeneralLedgerClient async period safety', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetGeneralLedgerSummary.mockReset();
        mockGetGeneralLedgerAccountEntries.mockReset();
        mockGetGeneralLedgerSummary.mockResolvedValue(summaryResult());
        mockGetGeneralLedgerAccountEntries.mockResolvedValue(detailResult());
    });

    it('opens the selected account at the validated WIB cutoff', async () => {
        render(
            <GeneralLedgerClient
                initialAccountId="acc-ap"
                initialToDate="2026-09-08"
            />,
        );

        await waitFor(() => {
            expect(mockGetGeneralLedgerAccountEntries).toHaveBeenCalledTimes(1);
        });

        const [from, to] = mockGetGeneralLedgerSummary.mock.calls[0] as [
            Date | undefined,
            Date,
        ];
        expect(from).toBeUndefined();
        expect(toBusinessDateString(to)).toBe('2026-09-08');
        expect(mockGetGeneralLedgerAccountEntries).toHaveBeenCalledWith(
            'acc-ap',
            from,
            to,
        );
        expect(await screen.findByText('Transaksi periode aktif')).toBeTruthy();
    });

    it('does not let an older summary overwrite a newer period', async () => {
        const oldRequest = deferred<ReturnType<typeof summaryResult>>();
        const newRequest = deferred<ReturnType<typeof summaryResult>>();
        mockGetGeneralLedgerSummary
            .mockReturnValueOnce(oldRequest.promise)
            .mockReturnValueOnce(newRequest.promise);

        render(<GeneralLedgerClient />);
        await waitFor(() => expect(mockGetGeneralLedgerSummary).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Pilih periode baru' }));
        await waitFor(() => expect(mockGetGeneralLedgerSummary).toHaveBeenCalledTimes(2));

        await act(async () => newRequest.resolve(summaryResult('Akun periode baru')));
        expect(await screen.findByText(/Akun periode baru/)).toBeTruthy();

        await act(async () => oldRequest.resolve(summaryResult('Akun periode lama')));
        await waitFor(() => expect(screen.queryByText(/Akun periode lama/)).toBeNull());
        expect(screen.getByText(/Akun periode baru/)).toBeTruthy();
    });

    it('ignores an older summary error after the newest period succeeds', async () => {
        const oldRequest = deferred<ReturnType<typeof summaryResult>>();
        const newRequest = deferred<ReturnType<typeof summaryResult>>();
        mockGetGeneralLedgerSummary
            .mockReturnValueOnce(oldRequest.promise)
            .mockReturnValueOnce(newRequest.promise);

        render(<GeneralLedgerClient />);
        await waitFor(() => expect(mockGetGeneralLedgerSummary).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Pilih periode baru' }));
        await waitFor(() => expect(mockGetGeneralLedgerSummary).toHaveBeenCalledTimes(2));

        await act(async () => newRequest.resolve(summaryResult('Akun periode baru')));
        expect(await screen.findByText(/Akun periode baru/)).toBeTruthy();
        await act(async () => oldRequest.reject(new Error('periode lama gagal')));

        expect(screen.getByText(/Akun periode baru/)).toBeTruthy();
        expect(screen.queryByText('Tidak ada data untuk periode ini')).toBeNull();
    });

    it('keeps the new period loading when an older summary finishes first', async () => {
        const oldRequest = deferred<ReturnType<typeof summaryResult>>();
        const newRequest = deferred<ReturnType<typeof summaryResult>>();
        mockGetGeneralLedgerSummary
            .mockReturnValueOnce(oldRequest.promise)
            .mockReturnValueOnce(newRequest.promise);

        render(<GeneralLedgerClient />);
        await waitFor(() => expect(mockGetGeneralLedgerSummary).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Pilih periode baru' }));
        await waitFor(() => expect(mockGetGeneralLedgerSummary).toHaveBeenCalledTimes(2));

        await act(async () => oldRequest.resolve(summaryResult('Akun periode lama')));
        expect(screen.getByText('Memuat data...')).toBeTruthy();
        expect(screen.queryByText(/Akun periode lama/)).toBeNull();

        await act(async () => newRequest.resolve(summaryResult('Akun periode baru')));
        expect(await screen.findByText(/Akun periode baru/)).toBeTruthy();
    });

    it('does not let an old auto detail overwrite the latest period detail', async () => {
        const oldDetail = deferred<ReturnType<typeof detailResult>>();
        const newDetail = deferred<ReturnType<typeof detailResult>>();
        mockGetGeneralLedgerAccountEntries
            .mockReturnValueOnce(oldDetail.promise)
            .mockReturnValueOnce(newDetail.promise);

        render(<GeneralLedgerClient initialAccountId={account.id} />);
        await waitFor(() => expect(mockGetGeneralLedgerAccountEntries).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Pilih periode baru' }));
        await waitFor(() => expect(mockGetGeneralLedgerAccountEntries).toHaveBeenCalledTimes(2));

        await act(async () => newDetail.resolve(detailResult('Detail periode baru')));
        expect(await screen.findByText('Detail periode baru')).toBeTruthy();

        await act(async () => oldDetail.resolve(detailResult('Detail periode lama')));
        await waitFor(() => expect(screen.queryByText('Detail periode lama')).toBeNull());
        expect(screen.getByText('Detail periode baru')).toBeTruthy();
    });

    it('ignores an old auto detail error after the latest detail succeeds', async () => {
        const oldDetail = deferred<ReturnType<typeof detailResult>>();
        const newDetail = deferred<ReturnType<typeof detailResult>>();
        mockGetGeneralLedgerAccountEntries
            .mockReturnValueOnce(oldDetail.promise)
            .mockReturnValueOnce(newDetail.promise);

        render(<GeneralLedgerClient initialAccountId={account.id} />);
        await waitFor(() => expect(mockGetGeneralLedgerAccountEntries).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Pilih periode baru' }));
        await waitFor(() => expect(mockGetGeneralLedgerAccountEntries).toHaveBeenCalledTimes(2));

        await act(async () => newDetail.resolve(detailResult('Detail periode baru')));
        expect(await screen.findByText('Detail periode baru')).toBeTruthy();
        await act(async () => oldDetail.reject(new Error('detail lama gagal')));

        expect(screen.getByText('Detail periode baru')).toBeTruthy();
        expect(screen.queryByText('Gagal memuat transaksi akun.')).toBeNull();
    });

    it('keeps a newer auto detail loading when the old detail finishes first', async () => {
        const oldDetail = deferred<ReturnType<typeof detailResult>>();
        const newDetail = deferred<ReturnType<typeof detailResult>>();
        mockGetGeneralLedgerAccountEntries
            .mockReturnValueOnce(oldDetail.promise)
            .mockReturnValueOnce(newDetail.promise);

        render(<GeneralLedgerClient initialAccountId={account.id} />);
        await waitFor(() => expect(mockGetGeneralLedgerAccountEntries).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Pilih periode baru' }));
        await waitFor(() => expect(mockGetGeneralLedgerAccountEntries).toHaveBeenCalledTimes(2));

        await act(async () => oldDetail.resolve(detailResult('Detail periode lama')));
        expect(screen.getByText('Memuat data...')).toBeTruthy();
        expect(screen.queryByText('Detail periode lama')).toBeNull();

        await act(async () => newDetail.resolve(detailResult('Detail periode baru')));
        expect(await screen.findByText('Detail periode baru')).toBeTruthy();
    });

    it('does not let a manual detail from an old period overwrite the new detail', async () => {
        const oldDetail = deferred<ReturnType<typeof detailResult>>();
        const newDetail = deferred<ReturnType<typeof detailResult>>();
        mockGetGeneralLedgerAccountEntries
            .mockReturnValueOnce(oldDetail.promise)
            .mockReturnValueOnce(newDetail.promise);

        render(<GeneralLedgerClient />);
        await screen.findByText(`(${account.code}) ${account.name}`);
        fireEvent.click(accountRow());
        await waitFor(() => expect(mockGetGeneralLedgerAccountEntries).toHaveBeenCalledTimes(1));

        fireEvent.click(screen.getByRole('button', { name: 'Pilih periode baru' }));
        await waitFor(() => expect(mockGetGeneralLedgerSummary).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.queryByText('Memuat data...')).toBeNull());
        fireEvent.click(accountRow());
        await waitFor(() => expect(mockGetGeneralLedgerAccountEntries).toHaveBeenCalledTimes(2));

        await act(async () => newDetail.resolve(detailResult('Manual periode baru')));
        expect(await screen.findByText('Manual periode baru')).toBeTruthy();
        await act(async () => oldDetail.resolve(detailResult('Manual periode lama')));

        await waitFor(() => expect(screen.queryByText('Manual periode lama')).toBeNull());
        expect(screen.getByText('Manual periode baru')).toBeTruthy();
    });

    it('keeps a newer manual detail loading when the old detail finishes first', async () => {
        const oldDetail = deferred<ReturnType<typeof detailResult>>();
        const newDetail = deferred<ReturnType<typeof detailResult>>();
        mockGetGeneralLedgerAccountEntries
            .mockReturnValueOnce(oldDetail.promise)
            .mockReturnValueOnce(newDetail.promise);

        render(<GeneralLedgerClient />);
        await screen.findByText(`(${account.code}) ${account.name}`);
        fireEvent.click(accountRow());
        await waitFor(() => expect(mockGetGeneralLedgerAccountEntries).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Pilih periode baru' }));
        await waitFor(() => expect(mockGetGeneralLedgerSummary).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.queryByText('Memuat data...')).toBeNull());
        fireEvent.click(accountRow());
        await waitFor(() => expect(mockGetGeneralLedgerAccountEntries).toHaveBeenCalledTimes(2));

        await act(async () => oldDetail.resolve(detailResult('Manual periode lama')));
        expect(screen.getByText('Memuat transaksi...')).toBeTruthy();
        expect(screen.queryByText('Manual periode lama')).toBeNull();

        await act(async () => newDetail.resolve(detailResult('Manual periode baru')));
        expect(await screen.findByText('Manual periode baru')).toBeTruthy();
    });

    it('shows an auto detail error per account and retries it', async () => {
        mockGetGeneralLedgerAccountEntries
            .mockResolvedValueOnce({ success: false, error: 'network' })
            .mockResolvedValueOnce(detailResult('Auto retry berhasil'));

        render(<GeneralLedgerClient initialAccountId={account.id} />);

        expect(await screen.findByText('Gagal memuat transaksi akun.')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));

        expect(await screen.findByText('Auto retry berhasil')).toBeTruthy();
        expect(screen.queryByText('Gagal memuat transaksi akun.')).toBeNull();
        expect(mockGetGeneralLedgerAccountEntries).toHaveBeenCalledTimes(2);
    });

    it('shows a manual detail error per account and retries it', async () => {
        mockGetGeneralLedgerAccountEntries
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce(detailResult('Manual retry berhasil'));

        render(<GeneralLedgerClient />);
        await screen.findByText(`(${account.code}) ${account.name}`);
        fireEvent.click(accountRow());

        expect(await screen.findByText('Gagal memuat transaksi akun.')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));

        expect(await screen.findByText('Manual retry berhasil')).toBeTruthy();
        expect(screen.queryByText('Gagal memuat transaksi akun.')).toBeNull();
        expect(mockGetGeneralLedgerAccountEntries).toHaveBeenCalledTimes(2);
    });
});
