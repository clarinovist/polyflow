// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetBalanceSheet } = vi.hoisted(() => ({
    mockGetBalanceSheet: vi.fn(),
}));

vi.mock('@/actions/finance/accounting', () => ({
    getBalanceSheet: (...args: unknown[]) => mockGetBalanceSheet(...args),
}));

vi.mock('@/components/ui/calendar', () => ({
    Calendar: ({ onSelect }: { onSelect: (date: Date) => void }) => (
        <button type="button" onClick={() => onSelect(new Date(2026, 8, 9))}>
            Pilih 9 September
        </button>
    ),
}));

vi.mock('@/components/ui/popover', () => ({
    Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/finance/reports/BalanceSheetReport', () => ({
    BalanceSheetReport: ({
        data,
        asOfDate,
    }: {
        data: { marker: string };
        asOfDate: string;
    }) => <div>{`report:${data.marker}:${asOfDate}`}</div>,
}));

import BalanceSheetPage from '../page';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const result = (marker: string) => ({
    success: true,
    data: { marker },
});

describe('BalanceSheetPage request ordering', () => {
    beforeEach(() => {
        mockGetBalanceSheet.mockReset();
    });

    it('keeps the newest date data when the old request resolves last', async () => {
        const oldRequest = deferred<ReturnType<typeof result>>();
        const newRequest = deferred<ReturnType<typeof result>>();
        mockGetBalanceSheet
            .mockReturnValueOnce(oldRequest.promise)
            .mockReturnValueOnce(newRequest.promise);

        render(<BalanceSheetPage />);
        await waitFor(() => expect(mockGetBalanceSheet).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Pilih 9 September' }));
        await waitFor(() => expect(mockGetBalanceSheet).toHaveBeenCalledTimes(2));

        await act(async () => newRequest.resolve(result('baru')));
        expect(await screen.findByText('report:baru:2026-09-09')).toBeTruthy();

        await act(async () => oldRequest.resolve(result('lama')));
        await waitFor(() => expect(screen.queryByText(/report:lama/)).toBeNull());
        expect(screen.getByText('report:baru:2026-09-09')).toBeTruthy();
    });

    it('ignores an old request error after the newest date succeeds', async () => {
        const oldRequest = deferred<ReturnType<typeof result>>();
        const newRequest = deferred<ReturnType<typeof result>>();
        mockGetBalanceSheet
            .mockReturnValueOnce(oldRequest.promise)
            .mockReturnValueOnce(newRequest.promise);

        render(<BalanceSheetPage />);
        await waitFor(() => expect(mockGetBalanceSheet).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Pilih 9 September' }));
        await waitFor(() => expect(mockGetBalanceSheet).toHaveBeenCalledTimes(2));

        await act(async () => newRequest.resolve(result('baru')));
        expect(await screen.findByText('report:baru:2026-09-09')).toBeTruthy();
        await act(async () => oldRequest.reject(new Error('request lama gagal')));

        expect(screen.getByText('report:baru:2026-09-09')).toBeTruthy();
        expect(screen.queryByText('Tidak ada data')).toBeNull();
    });

    it('keeps loading for the new date when the old request finishes first', async () => {
        const oldRequest = deferred<ReturnType<typeof result>>();
        const newRequest = deferred<ReturnType<typeof result>>();
        mockGetBalanceSheet
            .mockReturnValueOnce(oldRequest.promise)
            .mockReturnValueOnce(newRequest.promise);

        render(<BalanceSheetPage />);
        await waitFor(() => expect(mockGetBalanceSheet).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Pilih 9 September' }));
        await waitFor(() => expect(mockGetBalanceSheet).toHaveBeenCalledTimes(2));

        await act(async () => oldRequest.resolve(result('lama')));
        expect(screen.getByText('Loading...')).toBeTruthy();
        expect(screen.queryByText(/report:lama/)).toBeNull();

        await act(async () => newRequest.resolve(result('baru')));
        expect(await screen.findByText('report:baru:2026-09-09')).toBeTruthy();
    });
});
