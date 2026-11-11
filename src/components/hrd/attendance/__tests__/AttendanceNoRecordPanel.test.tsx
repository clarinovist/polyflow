// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import {
    AttendanceNoRecordPanel,
    type NoRecordRosterState,
} from '../AttendanceNoRecordPanel';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// Mock aksi supaya graf action/prisma tidak ikut termuat.
vi.mock('@/actions/admin/attendance', () => ({ setAbsent: vi.fn() }));

const SHIFTS = [{ id: 's-1', name: 'Shift Pagi', status: 'ACTIVE' }];
const EMPLOYEES = [
    {
        employeeId: 'e-1',
        name: 'Budi Contoh',
        code: 'E001',
        assignedShift: { id: 's-1', name: 'Shift Pagi' },
    },
    {
        employeeId: 'e-2',
        name: 'Siti Contoh',
        code: 'E002',
        assignedShift: null,
    },
];
const ready = (
    employees = EMPLOYEES,
    isNonWorkingDay = false,
): NoRecordRosterState => ({
    status: 'ready',
    data: { isNonWorkingDay, employees },
});

function setup(
    state: NoRecordRosterState,
    props: Partial<React.ComponentProps<typeof AttendanceNoRecordPanel>> = {},
) {
    const onRetry = vi.fn();
    const onMarked = vi.fn();
    render(
        <AttendanceNoRecordPanel
            state={state}
            workDate="2026-11-10"
            shifts={SHIFTS}
            query=""
            onRetry={onRetry}
            onMarked={onMarked}
            {...props}
        />,
    );
    return { onRetry, onMarked };
}

describe('AttendanceNoRecordPanel', () => {
    it('shows a loading status while the roster loads', () => {
        setup({ status: 'loading' });

        expect(screen.getByRole('status').textContent).toMatch(/Memuat/);
    });

    it('shows an error with a retry button instead of an empty list', () => {
        const { onRetry } = setup({
            status: 'error',
            message: 'Gagal memuat daftar belum absen',
        });

        expect(screen.getByRole('alert').textContent).toContain(
            'Gagal memuat daftar belum absen',
        );
        expect(screen.queryByText(/Semua karyawan sudah/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('explains Sunday is a non-working day', () => {
        setup(ready([], true));

        expect(screen.getByText(/Hari libur \(Minggu\)/)).toBeTruthy();
    });

    it('says everyone has a record when the roster is empty', () => {
        setup(ready([]));

        expect(
            screen.getByText(/Semua karyawan aktif sudah punya catatan absensi/),
        ).toBeTruthy();
    });

    it('lists each person with the assigned shift or a missing-shift note', () => {
        setup(ready());

        expect(screen.getByText('Budi Contoh')).toBeTruthy();
        expect(screen.getByText('E001')).toBeTruthy();
        expect(screen.getByText('Shift Pagi')).toBeTruthy();
        expect(screen.getByText('Siti Contoh')).toBeTruthy();
        expect(screen.getByText('Belum ada shift')).toBeTruthy();
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

    it('opens the confirmation dialog for the chosen person', () => {
        setup(ready());

        fireEvent.click(
            screen.getAllByRole('button', { name: /Tandai tidak hadir/ })[0],
        );

        const dialog = screen.getByRole('dialog');
        expect(dialog.textContent).toContain('Budi Contoh');
    });

    it('disables marking absent for a date that has not arrived yet', () => {
        setup(ready(), { workDate: '2999-01-01' });

        const buttons = screen.getAllByRole('button', {
            name: /Tandai tidak hadir/,
        });
        for (const button of buttons) {
            expect(button.hasAttribute('disabled')).toBe(true);
        }
        expect(screen.getByText(/belum tiba/i)).toBeTruthy();
    });
});
