// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import {
    Employee360AttendanceTab,
    shiftMonthBase,
} from '../Employee360AttendanceTab';
import { listAttendanceByEmployee } from '@/actions/hrd/attendance-employee';

vi.mock('@/actions/hrd/attendance-employee', () => ({
    listAttendanceByEmployee: vi.fn(),
}));

const mockedList = vi.mocked(listAttendanceByEmployee);

describe('shiftMonthBase', () => {
    it.each([
        ['2026-03-31T10:00:00Z', -1, '2026-02'],
        ['2026-05-31T10:00:00Z', -1, '2026-04'],
        ['2026-01-31T10:00:00Z', 1, '2026-02'],
        ['2026-03-01T10:00:00Z', -1, '2026-02'],
        ['2026-01-15T10:00:00Z', -1, '2025-12'],
    ])('from %s by %i lands in %s', (iso, delta, expected) => {
        const result = shiftMonthBase(new Date(iso), delta);
        expect(result.toISOString().slice(0, 7)).toBe(expected);
    });

    it('does not mutate the input date', () => {
        const base = new Date('2026-03-31T10:00:00Z');
        shiftMonthBase(base, -1);
        expect(base.toISOString()).toBe('2026-03-31T10:00:00.000Z');
    });
});

describe('Employee360AttendanceTab', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-05-31T10:00:00Z'));
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('goes back from 31 May to April, not May', async () => {
        mockedList.mockResolvedValue({ success: true, data: [] } as never);
        render(<Employee360AttendanceTab employeeId="e-1" />);
        await waitFor(() => expect(screen.getByText('Mei 2026')).toBeTruthy());

        fireEvent.click(screen.getByRole('button', { name: 'Bulan sebelumnya' }));

        await waitFor(() => expect(screen.getByText('April 2026')).toBeTruthy());
    });

    it('shows an error state with retry instead of an empty list when loading fails', async () => {
        mockedList.mockResolvedValueOnce({
            success: false,
            error: 'boom',
        } as never);
        render(<Employee360AttendanceTab employeeId="e-1" />);

        await waitFor(() =>
            expect(screen.getByText(/Gagal memuat data kehadiran/)).toBeTruthy(),
        );
        expect(screen.queryByText(/Tidak ada data kehadiran/)).toBeNull();

        mockedList.mockResolvedValueOnce({ success: true, data: [] } as never);
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));

        await waitFor(() =>
            expect(screen.getByText(/Tidak ada data kehadiran/)).toBeTruthy(),
        );
    });

    it('shows an error state when the action throws', async () => {
        mockedList.mockRejectedValueOnce(new Error('network'));
        render(<Employee360AttendanceTab employeeId="e-1" />);

        await waitFor(() =>
            expect(screen.getByText(/Gagal memuat data kehadiran/)).toBeTruthy(),
        );
    });
});

describe('Employee360AttendanceTab status labels', () => {
    it('shows Indonesian status labels, not uppercase codes', async () => {
        vi.resetAllMocks();
        const row = (id: string, status: string) => ({
            id,
            workDate: '2026-05-04T00:00:00Z',
            shiftName: `Shift ${id}`,
            clockInAt: null,
            clockOutAt: null,
            actualHours: null,
            overtimeHours: 0,
            isOvertimeShift: false,
            status,
            source: 'KIOSK',
            dailyEarnings: 0,
            totalEarnings: 0,
            clockInPhotoUrl: null,
            clockOutPhotoUrl: null,
            clockInDistance: null,
            clockOutDistance: null,
        });
        mockedList.mockResolvedValue({
            success: true,
            data: [row('a', 'PRESENT'), row('b', 'ABSENT'), row('c', 'ON_LEAVE')],
        } as never);
        const { container } = render(<Employee360AttendanceTab employeeId="e-1" />);
        await waitFor(() => expect(screen.getByText('Shift a')).toBeTruthy());

        const badges = Array.from(container.querySelectorAll('td span, td div'))
            .map((e) => e.textContent);
        expect(badges).toContain('Hadir');
        expect(badges).toContain('Alfa');
        expect(badges).toContain('Izin');
        expect(badges).not.toContain('CUTI');
        expect(badges).not.toContain('HADIR');
    });
});

describe('Employee360AttendanceTab anomaly badges', () => {
    const baseRow = {
        workDate: '2026-05-04T00:00:00Z',
        clockInAt: '2026-05-04T01:30:00Z',
        clockOutAt: null,
        actualHours: null,
        overtimeHours: 0,
        isOvertimeShift: false,
        status: 'PRESENT',
        source: 'KIOSK',
        dailyEarnings: 0,
        totalEarnings: 0,
        clockInPhotoUrl: null,
        clockOutPhotoUrl: null,
        clockInDistance: null,
        clockOutDistance: null,
    };

    it('shows badges only on flagged rows, in Indonesian, with no raw enums', async () => {
        vi.resetAllMocks();
        mockedList.mockResolvedValue({
            success: true,
            data: [
                {
                    ...baseRow,
                    id: 'flagged',
                    shiftName: 'Shift Flagged',
                    isLate: true,
                    isOutsideRadius: true,
                    hasValidSelfie: false,
                },
                {
                    ...baseRow,
                    id: 'clean',
                    shiftName: 'Shift Clean',
                    isLate: false,
                    isOutsideRadius: false,
                    hasValidSelfie: true,
                },
            ],
        } as never);
        render(<Employee360AttendanceTab employeeId="e-1" />);
        await waitFor(() => expect(screen.getByText('Shift Flagged')).toBeTruthy());

        const rows = screen.getAllByRole('row');
        const flaggedRow = rows.find((r) => r.textContent?.includes('Shift Flagged'))!;
        const cleanRow = rows.find((r) => r.textContent?.includes('Shift Clean'))!;
        expect(flaggedRow.textContent).toContain('Terlambat');
        expect(flaggedRow.textContent).toContain('Di luar radius');
        expect(flaggedRow.textContent).toContain('Tanpa selfie');
        expect(cleanRow.textContent).not.toContain('Terlambat');
        expect(cleanRow.textContent).not.toContain('Di luar radius');
        expect(cleanRow.textContent).not.toContain('Tanpa selfie');
        expect(document.body.textContent).not.toMatch(/\b(LATE|PRESENT|ABSENT)\b/);
    });

    it('shows no anomaly badges for absent rows', async () => {
        vi.resetAllMocks();
        mockedList.mockResolvedValue({
            success: true,
            data: [
                {
                    ...baseRow,
                    id: 'abs',
                    shiftName: 'Shift Abs',
                    status: 'ABSENT',
                    clockInAt: null,
                    hasValidSelfie: false,
                },
            ],
        } as never);
        render(<Employee360AttendanceTab employeeId="e-1" />);
        await waitFor(() => expect(screen.getByText('Shift Abs')).toBeTruthy());

        expect(screen.queryByText('Tanpa selfie')).toBeNull();
    });
});
