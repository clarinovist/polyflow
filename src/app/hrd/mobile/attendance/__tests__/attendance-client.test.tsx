// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HrdMobileTeamAttendanceResult } from '@/actions/hrd/mobile-dashboard';
import { HrdAttendanceClient } from '../attendance-client';

const push = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, refresh: vi.fn() }),
}));

function data(over: Partial<HrdMobileTeamAttendanceResult> = {}): HrdMobileTeamAttendanceResult {
    return {
        generatedAt: '2026-09-23T01:00:00.000Z',
        date: '2026-09-23',
        page: 2,
        pageSize: 20,
        pageCount: 3,
        totalEmployees: 45,
        returned: 2,
        presentCount: 30,
        absentCount: 2,
        onLeaveCount: 3,
        noRecordCount: 10,
        lateCount: 4,
        shifts: [],
        records: [
            {
                id: 'a', employeeId: 'e1', employeeName: 'Synthetic One', employeeCode: 'E1',
                employeeRole: 'FACTORY_MANAGER', shiftName: 'Pagi', clockInAt: null,
                clockOutAt: null, status: 'NO_RECORD', actualHours: null, isLate: null,
            },
            {
                id: 'b', employeeId: 'e2', employeeName: 'Synthetic Two', employeeCode: 'E2',
                employeeRole: 'OPERATOR', shiftName: 'Pagi', clockInAt: null,
                clockOutAt: null, status: 'ON_LEAVE', actualHours: null, isLate: null,
            },
        ],
        ...over,
    };
}

beforeEach(() => push.mockReset());

describe('HrdAttendanceClient', () => {
    it('renders no raw enum or English term', () => {
        const { container } = render(
            <HrdAttendanceClient initialData={data()} initialFilters={{ status: 'ALL' }} />,
        );
        expect(container.textContent).not.toMatch(/PRESENT|ABSENT|ON_LEAVE|NO_RECORD|FACTORY_MANAGER|OPERATOR/);
        expect(screen.getAllByText('Belum absen').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Izin').length).toBeGreaterThan(0);
        expect(screen.getByText(/Manajer Pabrik/)).toBeTruthy();
    });

    it('uses the same terms for tiles and filter options', () => {
        render(<HrdAttendanceClient initialData={data()} initialFilters={{ status: 'ALL' }} />);
        const options = screen
            .getByLabelText('Status absensi')
            .querySelectorAll('option');
        const texts = Array.from(options).map((o) => o.textContent);
        expect(texts).toEqual(['Semua Status', 'Hadir', 'Alfa', 'Izin', 'Belum absen', 'Terlambat']);
    });

    it('shows the x-y of N range and navigates to adjacent pages keeping filters', () => {
        render(
            <HrdAttendanceClient
                initialData={data()}
                initialFilters={{ status: 'LATE', date: '2026-09-23' }}
            />,
        );
        expect(screen.getByText('21–22 dari 45')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
        expect(push).toHaveBeenLastCalledWith(expect.stringContaining('page=3'));
        expect(push).toHaveBeenLastCalledWith(expect.stringContaining('status=LATE'));
        fireEvent.click(screen.getByRole('button', { name: 'Sebelumnya' }));
        expect(push.mock.calls.at(-1)?.[0]).not.toContain('page=');
    });

    it('disables previous on the first page and next on the last', () => {
        const { rerender } = render(
            <HrdAttendanceClient initialData={data({ page: 1 })} initialFilters={{ status: 'ALL' }} />,
        );
        expect((screen.getByRole('button', { name: 'Sebelumnya' }) as HTMLButtonElement).disabled).toBe(true);
        rerender(
            <HrdAttendanceClient initialData={data({ page: 3 })} initialFilters={{ status: 'ALL' }} />,
        );
        expect((screen.getByRole('button', { name: 'Berikutnya' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('resets to page 1 when applying filters', () => {
        render(
            <HrdAttendanceClient initialData={data({ page: 2 })} initialFilters={{ status: 'ALL' }} />,
        );
        fireEvent.change(screen.getByLabelText('Status absensi'), { target: { value: 'ABSENT' } });
        fireEvent.click(screen.getByRole('button', { name: 'Terapkan' }));
        const href = push.mock.calls.at(-1)?.[0] as string;
        expect(href).toContain('status=ABSENT');
        expect(href).not.toContain('page=');
    });

    it('shows the holiday note and no not-yet-clocked-in tile on a non-working day', () => {
        render(
            <HrdAttendanceClient
                initialData={data({ isNonWorkingDay: true, noRecordCount: 0, records: [] })}
                initialFilters={{ status: 'ALL' }}
            />,
        );
        expect(screen.getByText('Hari libur (Minggu)')).toBeTruthy();
        expect(screen.queryByText('Belum absen', { selector: 'div' })).toBeNull();
    });
});
