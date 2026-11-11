// @vitest-environment jsdom
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import React from 'react';
import { AttendanceRecap } from '../AttendanceRecap';
import * as actions from '@/actions/admin/attendance';
import * as closure from '@/actions/hrd/stale-session-closure';
import {
    APPLY_RESULT,
    PREVIEW,
} from '../attendance/__tests__/closureFixtures';
import { installRadixPolyfills, props } from './attendanceRecapTestKit';

const push = vi.fn();
const refresh = vi.fn();
let params = new URLSearchParams();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, refresh }),
    useSearchParams: () => params,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/actions/hrd/stale-session-closure', () => ({
    previewStaleSessionClosure: vi.fn(),
    applyStaleSessionClosure: vi.fn(),
}));
vi.mock('@/actions/admin/attendance', () => ({
    correctAttendance: vi.fn(),
    getAttendanceMonthlySummary: vi.fn(),
    getAttendanceWeeklySummary: vi.fn(),
    listNoRecordAttendance: vi.fn(),
    listStaleOpenSessions: vi.fn(),
    setAbsent: vi.fn(),
}));

const STALE = {
    id: 'stale-1',
    employeeId: 'e7',
    employeeName: 'Rina Contoh',
    employeeCode: 'E007',
    workDate: '2026-11-08',
    clockInAt: '2026-11-08T00:00:00.000Z',
    shift: { id: 's1', name: 'Pagi', startTime: '07:00', endTime: '15:00' },
    openHours: 72,
};

beforeAll(installRadixPolyfills);

beforeEach(() => {
    vi.clearAllMocks();
    params = new URLSearchParams();
    vi.mocked(actions.listNoRecordAttendance).mockResolvedValue({
        success: true,
        data: { isNonWorkingDay: false, employees: [] },
    } as never);
    vi.mocked(actions.listStaleOpenSessions).mockResolvedValue({
        success: true,
        data: { sessions: [STALE], truncated: false },
    } as never);
});

describe('AttendanceRecap filter Lupa pulang', () => {
    it('does not load or show the stale panel for other filters', () => {
        render(<AttendanceRecap {...props} />);

        expect(screen.queryByText('Sesi belum pulang')).toBeNull();
        expect(actions.listStaleOpenSessions).not.toHaveBeenCalled();
        expect(screen.getByText('Budi Contoh')).toBeTruthy();
    });

    it('shows the stale panel (and hides the day table) for ?status=stale', async () => {
        render(<AttendanceRecap {...props} initialStatus="stale" />);

        expect(await screen.findByText('Rina Contoh')).toBeTruthy();
        expect(screen.getByText('Sesi belum pulang')).toBeTruthy();
        expect(screen.queryByText('Budi Contoh')).toBeNull();
    });

    it('is selectable from the status filter bar', async () => {
        render(<AttendanceRecap {...props} />);

        fireEvent.change(screen.getByLabelText('Status'), {
            target: { value: 'stale' },
        });

        expect(await screen.findByText('Rina Contoh')).toBeTruthy();
        expect(screen.queryByText('Budi Contoh')).toBeNull();
    });

    it('leaves the stale view when another filter is chosen', async () => {
        render(<AttendanceRecap {...props} initialStatus="stale" />);
        await screen.findByText('Rina Contoh');

        fireEvent.change(screen.getByLabelText('Status'), {
            target: { value: 'all' },
        });

        expect(screen.queryByText('Rina Contoh')).toBeNull();
        expect(screen.getByText('Budi Contoh')).toBeTruthy();
    });

    it('corrects a session through the existing dialog and refreshes the page data', async () => {
        vi.mocked(actions.correctAttendance).mockResolvedValue({
            success: true,
        } as never);
        render(<AttendanceRecap {...props} initialStatus="stale" />);

        const row = (await screen.findByText('Rina Contoh')).closest(
            'li',
        ) as HTMLElement;
        fireEvent.click(within(row).getByRole('button', { name: /Koreksi jam/ }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText('Jam Pulang'), {
            target: { value: '2026-11-08T15:00' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan Koreksi' }));

        await waitFor(() =>
            expect(actions.correctAttendance).toHaveBeenCalledWith('stale-1', {
                clockOutAt: '2026-11-08T15:00',
            }),
        );
        await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
        await waitFor(() =>
            expect(actions.listStaleOpenSessions).toHaveBeenCalledTimes(2),
        );
    });
});

describe('AttendanceRecap bulk closure access', () => {
    it('hides bulk controls unless the role may bulk close (default)', async () => {
        render(<AttendanceRecap {...props} initialStatus="stale" />);

        await screen.findByText('Rina Contoh');

        expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
        expect(screen.queryByRole('button', { name: /Pratinjau koreksi/ })).toBeNull();
    });

    it('shows bulk controls to ADMIN/HRD and refreshes page data after applying', async () => {
        vi.mocked(closure.previewStaleSessionClosure).mockResolvedValue({
            success: true,
            data: PREVIEW,
        } as never);
        vi.mocked(closure.applyStaleSessionClosure).mockResolvedValue({
            success: true,
            data: APPLY_RESULT,
        } as never);
        render(<AttendanceRecap {...props} initialStatus="stale" canBulkClose />);
        await screen.findByText('Rina Contoh');

        fireEvent.click(screen.getByRole('checkbox', { name: 'Pilih Rina Contoh' }));
        fireEvent.click(screen.getByRole('button', { name: /Pratinjau koreksi \(1\)/ }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(await within(dialog).findByRole('checkbox', { name: /Saya mengerti/ }));
        fireEvent.click(within(dialog).getByRole('button', { name: 'Terapkan koreksi' }));

        await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
        expect(await within(dialog).findByText(/2 sesi ditutup/)).toBeTruthy();
    });
});
