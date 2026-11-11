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
    installRadixPolyfills,
    monthlyRows,
    props,
    weeklyRows,
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

describe('AttendanceRecap weekly view', () => {
    beforeEach(() => {
        params = new URLSearchParams('mode=weekly');
    });

    it('loads once on mount for the weekly view', async () => {
        vi.mocked(actions.getAttendanceWeeklySummary).mockResolvedValue({ success: true, data: weeklyRows } as never);
        renderDaily();
        await screen.findByText('2 orang');
        expect(actions.getAttendanceWeeklySummary).toHaveBeenCalledTimes(1);
    });

    it('loads and renders the weekly summary with totals', async () => {
        vi.mocked(actions.getAttendanceWeeklySummary).mockResolvedValue({
            success: true,
            data: weeklyRows,
        } as never);
        renderDaily();
        expect(screen.getByText('Memuat…')).toBeTruthy();
        await screen.findByText('2 orang');
        expect(screen.getByText('9 hari')).toBeTruthy();
        expect(screen.getAllByText('72.0j').length).toBeGreaterThan(0);
        expect(screen.getAllByText('2.0j').length).toBeGreaterThan(0);
        expect(screen.getAllByText(/950\.000/).length).toBeGreaterThan(0);
        expect(screen.getByRole('columnheader', { name: 'OT Rp' })).toBeTruthy();
        const row = screen.getByText('Budi Contoh').closest('tr') as HTMLElement;
        expect(row.textContent).toContain('550.000');
        const [start, end] = vi.mocked(actions.getAttendanceWeeklySummary).mock.calls[0];
        expect(typeof start).toBe('string');
        expect(typeof end).toBe('string');
        expect(start < end).toBe(true);
    });

    it('shows the week range label, payroll link and hides daily controls', async () => {
        vi.mocked(actions.getAttendanceWeeklySummary).mockResolvedValue({ success: true, data: [] } as never);
        renderDaily();
        await screen.findByText(/Tidak ada data absensi untuk minggu/);
        expect(
            screen.getByRole('link', { name: '→ Gaji Mingguan' }).getAttribute('href'),
        ).toBe('/hrd/payroll?date=2026-11-10');
        expect(screen.queryByRole('button', { name: 'Filter Lembur' })).toBeNull();
        expect(screen.queryByRole('searchbox')).toBeNull();
    });

    it('pushes the date param from the week picker', async () => {
        vi.mocked(actions.getAttendanceWeeklySummary).mockResolvedValue({ success: true, data: [] } as never);
        renderDaily();
        fireEvent.change(screen.getByDisplayValue('2026-11-10'), { target: { value: '2026-11-17' } });
        expect(lastPushedParams().get('date')).toBe('2026-11-17');
        await screen.findByText(/Tidak ada data absensi untuk minggu/);
    });

    it('shows error with retry and no stale data on failure', async () => {
        vi.mocked(actions.getAttendanceWeeklySummary)
            .mockResolvedValueOnce({ success: false, error: 'Gagal memuat rekap mingguan' } as never)
            .mockResolvedValueOnce({ success: true, data: [] } as never);
        renderDaily();
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('Gagal memuat rekap mingguan');
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        await waitFor(() => expect(actions.getAttendanceWeeklySummary).toHaveBeenCalledTimes(2));
        await screen.findByText(/Tidak ada data absensi untuk minggu/);
    });
});

describe('AttendanceRecap monthly view', () => {
    beforeEach(() => {
        params = new URLSearchParams('mode=monthly&year=2026&month=11');
    });

    it('loads and renders the monthly summary with totals', async () => {
        vi.mocked(actions.getAttendanceMonthlySummary).mockResolvedValue({
            success: true,
            data: monthlyRows,
        } as never);
        renderDaily();
        expect(screen.getByText('Memuat…')).toBeTruthy();
        await screen.findByText('2 orang');
        expect(actions.getAttendanceMonthlySummary).toHaveBeenCalledWith(2026, 11);
        expect(screen.getByText('42 hari')).toBeTruthy();
        expect(screen.getByText('Total Alfa')).toBeTruthy();
        expect(screen.getByText('2 hari')).toBeTruthy();
        expect(screen.getByText('330.3j')).toBeTruthy();
        expect(screen.getAllByText('4.5j')).toHaveLength(2);
        const row = screen.getByText('Budi Contoh').closest('tr') as HTMLElement;
        const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
        expect(cells).toEqual(['E001', 'Budi Contoh', '20', '2', '1', '3', '160.3j', '4.5j']);
        const zero = screen.getByText('Siti Contoh').closest('tr') as HTMLElement;
        expect(within(zero).getAllByRole('cell')[3].textContent).toBe('0');
        expect(
            screen.getByRole('link', { name: '→ Gaji Bulanan' }).getAttribute('href'),
        ).toBe('/hrd/payroll-monthly');
    });

    it('loads once on mount and does not refetch on unrelated re-renders', async () => {
        vi.mocked(actions.getAttendanceMonthlySummary).mockResolvedValue({ success: true, data: monthlyRows } as never);
        const { rerender } = renderDaily();
        await screen.findByText('2 orang');
        rerender(<AttendanceRecap {...props} overtimeOnly />);
        rerender(<AttendanceRecap {...props} summary={null} />);
        expect(actions.getAttendanceMonthlySummary).toHaveBeenCalledTimes(1);
    });

    it('refetches when the period in the URL changes', async () => {
        vi.mocked(actions.getAttendanceMonthlySummary).mockResolvedValue({ success: true, data: [] } as never);
        const { rerender } = renderDaily();
        await screen.findByText(/Tidak ada data absensi untuk November/);
        params = new URLSearchParams('mode=monthly&year=2026&month=3');
        rerender(<AttendanceRecap {...props} />);
        await screen.findByText('Tidak ada data absensi untuk Maret 2026');
        expect(actions.getAttendanceMonthlySummary).toHaveBeenLastCalledWith(2026, 3);
        expect(actions.getAttendanceMonthlySummary).toHaveBeenCalledTimes(2);
    });

    it('shows the empty message with month and year', async () => {
        vi.mocked(actions.getAttendanceMonthlySummary).mockResolvedValue({ success: true, data: [] } as never);
        renderDaily();
        await screen.findByText('Tidak ada data absensi untuk November 2026');
    });

    it('shows error then retries successfully', async () => {
        vi.mocked(actions.getAttendanceMonthlySummary)
            .mockResolvedValueOnce({ success: false, error: 'Gagal memuat rekap bulanan' } as never)
            .mockResolvedValueOnce({ success: true, data: monthlyRows } as never);
        renderDaily();
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('Gagal memuat rekap bulanan');
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        await screen.findByText('2 orang');
        expect(actions.getAttendanceMonthlySummary).toHaveBeenCalledTimes(2);
    });

    it('pushes the month param when another month is chosen', async () => {
        vi.mocked(actions.getAttendanceMonthlySummary).mockResolvedValue({ success: true, data: [] } as never);
        renderDaily();
        await screen.findByText(/Tidak ada data absensi untuk November/);
        const [monthTrigger] = screen.getAllByRole('combobox');
        fireEvent.keyDown(monthTrigger, { key: 'Enter' });
        fireEvent.click(await screen.findByRole('option', { name: 'Maret' }));
        const sp = lastPushedParams();
        expect(sp.get('month')).toBe('3');
        expect(sp.get('year')).toBe('2026');
    });

    it('pushes the year param when another year is chosen', async () => {
        vi.mocked(actions.getAttendanceMonthlySummary).mockResolvedValue({ success: true, data: [] } as never);
        renderDaily();
        await screen.findByText(/Tidak ada data absensi untuk November/);
        const yearTrigger = screen.getAllByRole('combobox')[1];
        fireEvent.keyDown(yearTrigger, { key: 'Enter' });
        fireEvent.click(await screen.findByRole('option', { name: '2025' }));
        const sp = lastPushedParams();
        expect(sp.get('year')).toBe('2025');
        expect(sp.get('month')).toBe('11');
    });

    it('defaults year and month from currentDate when the URL has none', async () => {
        params = new URLSearchParams('mode=monthly');
        vi.mocked(actions.getAttendanceMonthlySummary).mockResolvedValue({ success: true, data: [] } as never);
        renderDaily();
        await screen.findByText('Tidak ada data absensi untuk November 2026');
        expect(actions.getAttendanceMonthlySummary).toHaveBeenCalledWith(2026, 11);
    });
});

