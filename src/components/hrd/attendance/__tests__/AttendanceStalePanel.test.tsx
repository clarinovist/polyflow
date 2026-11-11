// @vitest-environment jsdom

import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { AttendanceStalePanel } from '../AttendanceStalePanel';
import type { StaleSessionsState } from '../useStaleOpenSessions';

const SESSIONS = [
    {
        id: 'r1',
        employeeId: 'e1',
        employeeName: 'Budi Contoh',
        employeeCode: 'E001',
        workDate: '2026-11-09',
        // 07:05 WIB
        clockInAt: '2026-11-09T00:05:00.000Z',
        shift: { id: 's1', name: 'Pagi', startTime: '07:00', endTime: '15:00' },
        openHours: 30.5,
    },
    {
        id: 'r2',
        employeeId: 'e2',
        employeeName: 'Siti Contoh',
        employeeCode: 'E002',
        workDate: '2026-11-08',
        clockInAt: '2026-11-08T13:00:00.000Z',
        shift: { id: 's2', name: 'Malam', startTime: '20:00', endTime: '08:00' },
        openHours: 48,
    },
];

const ready = (sessions = SESSIONS, truncated = false): StaleSessionsState => ({
    status: 'ready',
    data: { sessions, truncated },
});

function setup(
    state: StaleSessionsState,
    props: Partial<React.ComponentProps<typeof AttendanceStalePanel>> = {},
) {
    const onRetry = vi.fn();
    const onCorrect = vi.fn();
    render(
        <AttendanceStalePanel
            state={state}
            query=""
            onRetry={onRetry}
            onCorrect={onCorrect}
            {...props}
        />,
    );
    return { onRetry, onCorrect };
}

describe('AttendanceStalePanel', () => {
    it('shows a loading status while the list loads', () => {
        setup({ status: 'loading' });

        expect(screen.getByRole('status').textContent).toMatch(/Memuat/);
    });

    it('shows an error with a retry button instead of an empty list', () => {
        const { onRetry } = setup({
            status: 'error',
            message: 'Gagal memuat sesi belum pulang',
        });

        expect(screen.getByRole('alert').textContent).toContain(
            'Gagal memuat sesi belum pulang',
        );
        expect(screen.queryByText(/Tidak ada sesi/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('states plainly that nothing is open when the list is empty', () => {
        setup(ready([]));

        expect(
            screen.getByText('Tidak ada sesi yang belum pulang'),
        ).toBeTruthy();
    });

    it('lists each session with work date, clock-in, shift and open hours', () => {
        setup(ready());

        const row = screen.getByText('Budi Contoh').closest('li') as HTMLElement;
        expect(within(row).getByText('E001')).toBeTruthy();
        expect(within(row).getByText(/Pagi \(07:00–15:00\)/)).toBeTruthy();
        expect(within(row).getByText(/9 Nov 2026/)).toBeTruthy();
        expect(within(row).getByText(/07\.05/)).toBeTruthy();
        expect(within(row).getByText('Terbuka 30,5 jam')).toBeTruthy();
        expect(within(row).getByText('Lupa pulang')).toBeTruthy();
        expect(screen.getByText('Siti Contoh')).toBeTruthy();
        expect(screen.getByText('Terbuka 48 jam')).toBeTruthy();
    });

    it('shows the title and how many sessions are listed', () => {
        setup(ready());

        expect(screen.getByText('Sesi belum pulang')).toBeTruthy();
        expect(screen.getByText(/· 2 sesi/)).toBeTruthy();
    });

    it('warns when the list was cut off at the limit', () => {
        setup(ready(SESSIONS, true));

        expect(screen.getByText(/sebagian sesi lebih lama tidak ditampilkan/i)).toBeTruthy();
    });

    it('does not warn about truncation when the list is complete', () => {
        setup(ready());

        expect(screen.queryByText(/tidak ditampilkan/i)).toBeNull();
    });

    it('filters by the search query on name or code', () => {
        setup(ready(), { query: 'e002' });

        expect(screen.queryByText('Budi Contoh')).toBeNull();
        expect(screen.getByText('Siti Contoh')).toBeTruthy();
    });

    it('says nothing matches when the query excludes everyone', () => {
        setup(ready(), { query: 'zzz' });

        expect(screen.getByText(/Tidak ada karyawan yang cocok/)).toBeTruthy();
    });

    it('hands the chosen session to the correction callback', () => {
        const { onCorrect } = setup(ready());

        fireEvent.click(
            screen.getAllByRole('button', { name: /Koreksi jam/ })[1],
        );

        expect(onCorrect).toHaveBeenCalledWith(SESSIONS[1]);
    });
});
