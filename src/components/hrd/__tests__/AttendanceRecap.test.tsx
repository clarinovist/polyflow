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
import {
    base,
    installRadixPolyfills,
    props,
} from './attendanceRecapTestKit';

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
    setAbsent: vi.fn(),
}));

beforeAll(installRadixPolyfills);

function renderDaily(overrides: Partial<React.ComponentProps<typeof AttendanceRecap>> = {}) {
    return render(<AttendanceRecap {...props} {...overrides} />);
}

function lastPushedParams(): URLSearchParams {
    const url = push.mock.calls.at(-1)?.[0] as string;
    return new URLSearchParams(url.split('?')[1]);
}

beforeEach(() => {
    vi.clearAllMocks();
    params = new URLSearchParams();
    vi.mocked(actions.listNoRecordAttendance).mockResolvedValue({
        success: true,
        data: {
            isNonWorkingDay: false,
            employees: [
                {
                    employeeId: 'e9',
                    name: 'Zed Contoh',
                    code: 'E009',
                    assignedShift: { id: 's1', name: 'Pagi' },
                },
            ],
        },
    } as never);
});

describe('AttendanceRecap daily view', () => {
    it('renders headers, rows and per-row details', () => {
        renderDaily({
            records: [
                {
                    ...base,
                    id: 'r1',
                    clockOutAt: '2026-11-10T08:30:00.000Z',
                    clockOutPhotoUrl: '/api/images/acme/attendance/e1/b.jpg',
                    actualHours: 8.5,
                    overtimeHours: 1.5,
                    isOvertimeShift: true,
                    source: 'SELF_SERVICE',
                    clockInDistance: 250,
                    clockInLatitude: -6.2,
                    clockInLongitude: 106.8,
                },
            ],
        });
        for (const header of [
            'Kode', 'Nama', 'Foto', 'Shift', 'Rencana', 'Masuk', 'Pulang',
            'Aktual', 'OT', 'Shift Ganda', 'Sumber', 'Aksi',
        ]) {
            expect(screen.getByRole('columnheader', { name: header })).toBeTruthy();
        }
        const row = screen.getByText('Budi Contoh').closest('tr') as HTMLElement;
        const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
        expect(cells[0]).toBe('E001');
        expect(cells[3]).toBe('Pagi');
        expect(cells[4]).toBe('8.0j');
        expect(cells[5]).toBe('07.00');
        expect(cells[6]).toBe('15.30');
        expect(cells[7]).toBe('8.5j');
        expect(cells[8]).toBe('+1.5j');
        expect(cells[9]).toBe('Ya');
        expect(cells[10]).toContain('Mandiri');
        expect(cells[10]).toContain('250m');
        const maps = within(row).getByTitle('-6.2, 106.8');
        expect(maps.getAttribute('href')).toContain('google.com/maps');
        expect(maps.getAttribute('target')).toBe('_blank');
        expect(within(row).getByLabelText('Lihat selfie pulang Budi Contoh')).toBeTruthy();
    });

    it('shows dashes for missing times, hours and overtime and km for long distance', () => {
        renderDaily({
            records: [{ ...base, id: 'r1', clockInAt: null, clockInDistance: 1500, source: 'MANUAL' }],
        });
        const row = screen.getByText('Budi Contoh').closest('tr') as HTMLElement;
        const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
        expect(cells[5]).toBe('-');
        expect(cells[6]).toBe('-');
        expect(cells[7]).toBe('-');
        expect(cells[8]).toBe('-');
        expect(cells[10]).toContain('Manual');
        expect(cells[10]).toContain('1.5km');
    });

    it('falls back to the raw source for unknown sources', () => {
        renderDaily({ records: [{ ...base, id: 'r1', source: 'IMPORT' }] });
        expect(screen.getByText('IMPORT')).toBeTruthy();
    });

    it('renders row badges for late and absent employees', () => {
        renderDaily();
        const lateRow = screen.getByText('Siti Contoh').closest('tr') as HTMLElement;
        expect(within(lateRow).getByText('Terlambat')).toBeTruthy();
        const absentRow = screen.getByText('Andi Contoh').closest('tr') as HTMLElement;
        expect(within(absentRow).getByText('Alfa')).toBeTruthy();
        // Badge selfie/radius hanya untuk record hadir.
        expect(within(absentRow).queryByText('Tanpa selfie')).toBeNull();
    });

    it('renders summary chips with counts', async () => {
        renderDaily();
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /^Belum absen 1/ })).toBeTruthy(),
        );
        expect(screen.getByRole('button', { name: /^Hadir 2/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /^Terlambat 1/ })).toBeTruthy();
    });

    it('renders summary cards only when a summary is provided', () => {
        const { unmount } = renderDaily();
        expect(screen.queryByText('Catatan')).toBeNull();
        unmount();
        renderDaily({
            summary: {
                totalEmployees: 3,
                totalRecords: 4,
                multiShiftCount: 1,
                totalActualHours: 24.25,
                totalOvertimeHours: 2,
            },
        });
        expect(screen.getByText('3 orang')).toBeTruthy();
        expect(screen.getByText('4 shift')).toBeTruthy();
        expect(screen.getByText('1 orang')).toBeTruthy();
        expect(screen.getByText('24.3j')).toBeTruthy();
        expect(screen.getByText('2.0j')).toBeTruthy();
    });

    it('applies the initial status filter from the URL (late)', async () => {
        renderDaily({ initialStatus: 'late' });
        expect(screen.getByText('Siti Contoh')).toBeTruthy();
        expect(screen.queryByText('Budi Contoh')).toBeNull();
        await waitFor(() => expect(actions.listNoRecordAttendance).toHaveBeenCalled());
    });

    it('filters rows by search query on name or code', () => {
        renderDaily();
        const input = screen.getByRole('searchbox');
        fireEvent.change(input, { target: { value: 'siti' } });
        expect(screen.getByText('Siti Contoh')).toBeTruthy();
        expect(screen.queryByText('Budi Contoh')).toBeNull();
        fireEvent.change(input, { target: { value: 'E003' } });
        expect(screen.getByText('Andi Contoh')).toBeTruthy();
        expect(screen.queryByText('Siti Contoh')).toBeNull();
    });

    it('shows a no-match message when the filter removes every row', () => {
        renderDaily();
        fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
        expect(screen.getByText('Tidak ada data yang cocok dengan filter')).toBeTruthy();
    });

    it('shows the empty message when there are no records', () => {
        renderDaily({ records: [] });
        expect(screen.getByText('Tidak ada data absensi untuk tanggal ini')).toBeTruthy();
    });

    it('changes the status filter through a chip', () => {
        renderDaily();
        fireEvent.click(screen.getByRole('button', { name: /^Terlambat 1/ }));
        expect(screen.queryByText('Budi Contoh')).toBeNull();
        expect(screen.getByText('Siti Contoh')).toBeTruthy();
    });

    it('shows the server load error with retry instead of an empty table', () => {
        renderDaily({ records: [], loadError: 'Gagal memuat data absensi' });
        expect(screen.getByRole('alert').textContent).toContain('Gagal memuat data absensi');
        expect(screen.queryByText(/Tidak ada data absensi untuk tanggal ini/)).toBeNull();
        expect(screen.queryByRole('searchbox')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('shows the no-record panel and marks an employee absent', async () => {
        vi.mocked(actions.setAbsent).mockResolvedValue({ success: true } as never);
        renderDaily({ initialStatus: 'norecord' });
        await screen.findByText('Zed Contoh');
        expect(screen.queryByText('Budi Contoh')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Tandai tidak hadir' }));
        fireEvent.click(screen.getByRole('button', { name: 'Ya, tandai tidak hadir' }));
        await waitFor(() =>
            expect(actions.setAbsent).toHaveBeenCalledWith('e9', '2026-11-10', 's1'),
        );
        await waitFor(() => expect(refresh).toHaveBeenCalled());
        await waitFor(() => expect(actions.listNoRecordAttendance).toHaveBeenCalledTimes(2));
    });
});

describe('AttendanceRecap toolbar and navigation', () => {
    it('renders the three view mode tabs', () => {
        renderDaily();
        for (const name of ['Harian', 'Mingguan', 'Bulanan']) {
            expect(screen.getByRole('button', { name })).toBeTruthy();
        }
    });

    it('csv export is an anchor outside any button with daily params', () => {
        renderDaily({ currentShift: 's1', overtimeOnly: true });
        const link = screen.getByRole('link', { name: /CSV/ });
        expect(link.closest('button')).toBeNull();
        const url = new URL(link.getAttribute('href') as string, 'http://x');
        expect(url.pathname).toBe('/api/hrd/attendance/export');
        expect(url.searchParams.get('mode')).toBe('daily');
        expect(url.searchParams.get('date')).toBe('2026-11-10');
        expect(url.searchParams.get('shift')).toBe('s1');
        expect(url.searchParams.get('ot')).toBe('1');
    });

    it('csv export omits shift and ot when unset', () => {
        renderDaily();
        expect(screen.getByRole('link', { name: /CSV/ }).getAttribute('href')).toBe(
            '/api/hrd/attendance/export?mode=daily&date=2026-11-10',
        );
    });

    it('csv export uses weekly and monthly params', async () => {
        params = new URLSearchParams('mode=weekly');
        vi.mocked(actions.getAttendanceWeeklySummary).mockResolvedValue({ success: true, data: [] } as never);
        const { unmount } = renderDaily();
        expect(screen.getByRole('link', { name: /CSV/ }).getAttribute('href')).toBe(
            '/api/hrd/attendance/export?mode=weekly&date=2026-11-10',
        );
        await screen.findByText(/Tidak ada data absensi untuk minggu/);
        unmount();
        params = new URLSearchParams('mode=monthly&year=2026&month=3');
        vi.mocked(actions.getAttendanceMonthlySummary).mockResolvedValue({ success: true, data: [] } as never);
        renderDaily();
        expect(screen.getByRole('link', { name: /CSV/ }).getAttribute('href')).toBe(
            '/api/hrd/attendance/export?mode=monthly&year=2026&month=3',
        );
        await screen.findByText('Tidak ada data absensi untuk Maret 2026');
    });

    it('pushes the date param when the date changes', () => {
        renderDaily();
        const input = screen.getByDisplayValue('2026-11-10');
        fireEvent.change(input, { target: { value: '2026-11-12' } });
        expect(push).toHaveBeenCalledWith('/hrd/attendance?date=2026-11-12');
    });

    it('toggles the overtime filter', () => {
        const { unmount } = renderDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Filter Lembur' }));
        expect(lastPushedParams().get('ot')).toBe('1');
        unmount();
        params = new URLSearchParams('ot=1');
        renderDaily({ overtimeOnly: true });
        fireEvent.click(screen.getByRole('button', { name: 'Lembur ON' }));
        expect(lastPushedParams().has('ot')).toBe(false);
    });

    it('selects a shift and clears it again, listing only active shifts', async () => {
        renderDaily({ currentShift: 's1' });
        const trigger = screen.getAllByRole('combobox')[0];
        expect(trigger.textContent).toContain('Pagi');
        fireEvent.keyDown(trigger, { key: 'Enter' });
        expect(await screen.findByRole('option', { name: 'Malam' })).toBeTruthy();
        expect(screen.queryByRole('option', { name: 'Lama' })).toBeNull();
        fireEvent.click(screen.getByRole('option', { name: 'Malam' }));
        expect(lastPushedParams().get('shift')).toBe('s2');
    });

    it('clears the shift param when choosing all shifts', async () => {
        params = new URLSearchParams('shift=s1');
        renderDaily({ currentShift: 's1' });
        fireEvent.keyDown(screen.getAllByRole('combobox')[0], { key: 'Enter' });
        fireEvent.click(await screen.findByRole('option', { name: 'Semua shift' }));
        expect(lastPushedParams().has('shift')).toBe(false);
    });

    it('switches to weekly and monthly modes with the right params', () => {
        params = new URLSearchParams('year=2025&month=2');
        vi.mocked(actions.getAttendanceWeeklySummary).mockResolvedValue({ success: true, data: [] } as never);
        vi.mocked(actions.getAttendanceMonthlySummary).mockResolvedValue({ success: true, data: [] } as never);
        renderDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Mingguan' }));
        let sp = lastPushedParams();
        expect(sp.get('mode')).toBe('weekly');
        expect(sp.has('year')).toBe(false);
        expect(sp.has('month')).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'Bulanan' }));
        sp = lastPushedParams();
        expect(sp.get('mode')).toBe('monthly');
        expect(sp.get('year')).toBe('2025');
        expect(sp.get('month')).toBe('2');
        fireEvent.click(screen.getByRole('button', { name: 'Harian' }));
        sp = lastPushedParams();
        expect(sp.get('mode')).toBe('daily');
        expect(sp.has('year')).toBe(false);
    });
});

