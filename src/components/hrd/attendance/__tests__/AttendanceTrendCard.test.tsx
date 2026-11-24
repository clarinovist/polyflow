// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ComposedChart: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="recharts-composed">{children}</div>
    ),
    Bar: ({ dataKey }: { dataKey: string }) => <div data-testid={`bar-${dataKey}`} />,
    Line: ({ dataKey }: { dataKey: string }) => <div data-testid={`line-${dataKey}`} />,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Legend: () => null,
}));

vi.mock('@/actions/hrd/attendance-trend', () => ({
    getHrdAttendanceTrend: vi.fn(),
}));

import { getHrdAttendanceTrend } from '@/actions/hrd/attendance-trend';
import { AttendanceTrendCard } from '../AttendanceTrendCard';

const mockedGetTrend = vi.mocked(getHrdAttendanceTrend);

const SHIFTS = [
    { id: 's1', name: 'Pagi', startTime: '08:00', endTime: '16:00', status: 'ACTIVE' },
    { id: 's2', name: 'Malam', startTime: '20:00', endTime: '04:00', status: 'ACTIVE' },
];

beforeAll(() => {
    const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.scrollIntoView = vi.fn();
    proto.hasPointerCapture = vi.fn(() => false);
    proto.releasePointerCapture = vi.fn();
    proto.setPointerCapture = vi.fn();
});

describe('AttendanceTrendCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('loads 30 days by default, shows rate line and B5 denominator note', async () => {
        mockedGetTrend.mockResolvedValue({
            success: true,
            data: {
                from: '2026-06-01',
                to: '2026-06-30',
                shiftFiltered: false,
                averageRate: 90.5,
                totals: { onTime: 18, late: 2, present: 20, onLeave: 1, absent: 1, noRecord: 2 },
                days: [
                    {
                        date: '2026-06-30',
                        onTime: 18,
                        late: 2,
                        present: 20,
                        onLeave: 1,
                        absent: 1,
                        noRecord: 2,
                        eligibleHeadcount: 24,
                        attendanceRate: 83.3,
                    },
                ],
            },
        } as never);

        render(<AttendanceTrendCard shifts={SHIFTS} />);
        await waitFor(() => expect(screen.getByText('90.5%')).toBeTruthy());

        expect(screen.getByTestId('line-attendanceRate')).toBeTruthy();
        expect(screen.getByText(/Tanpa catatan/)).toBeTruthy();
        expect(screen.getByText(/Catatan pembagi:/)).toBeTruthy();
    });

    it('switches range presets and hides rate line & noRecord when filtered by shift', async () => {
        mockedGetTrend.mockResolvedValue({
            success: true,
            data: {
                from: '2026-06-01',
                to: '2026-06-30',
                shiftFiltered: false,
                averageRate: 85,
                totals: { onTime: 10, late: 0, present: 10, onLeave: 0, absent: 0, noRecord: 0 },
                days: [
                    {
                        date: '2026-06-30',
                        onTime: 10,
                        late: 0,
                        present: 10,
                        onLeave: 0,
                        absent: 0,
                        noRecord: 0,
                        eligibleHeadcount: 10,
                        attendanceRate: 100,
                    },
                ],
            },
        } as never);

        render(<AttendanceTrendCard shifts={SHIFTS} />);
        await waitFor(() => expect(screen.getByText('85%')).toBeTruthy());

        fireEvent.click(screen.getByRole('button', { name: '7 hari' }));
        await waitFor(() => expect(mockedGetTrend).toHaveBeenCalledTimes(2));

        mockedGetTrend.mockResolvedValueOnce({
            success: true,
            data: {
                from: '2026-06-24',
                to: '2026-06-30',
                shiftFiltered: true,
                averageRate: null,
                totals: { onTime: 5, late: 1, present: 6, onLeave: 0, absent: 0, noRecord: null },
                days: [
                    {
                        date: '2026-06-30',
                        onTime: 5,
                        late: 1,
                        present: 6,
                        onLeave: 0,
                        absent: 0,
                        noRecord: null,
                        eligibleHeadcount: null,
                        attendanceRate: null,
                    },
                ],
            },
        } as never);

        fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter shift tren' }), {
            key: 'Enter',
        });
        fireEvent.click(await screen.findByRole('option', { name: 'Pagi' }));

        await waitFor(() =>
            expect(screen.getByText(/Filter shift aktif:/)).toBeTruthy(),
        );
        expect(screen.queryByTestId('line-attendanceRate')).toBeNull();
    });

    it('shows error state with retry and empty state', async () => {
        mockedGetTrend.mockResolvedValueOnce({
            success: false,
            error: 'Gagal server',
        } as never);
        render(<AttendanceTrendCard shifts={SHIFTS} />);

        await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
        mockedGetTrend.mockResolvedValueOnce({
            success: true,
            data: {
                from: '2026-06-01',
                to: '2026-06-30',
                shiftFiltered: false,
                averageRate: null,
                totals: { onTime: 0, late: 0, present: 0, onLeave: 0, absent: 0, noRecord: 0 },
                days: [],
            },
        } as never);

        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        await waitFor(() =>
            expect(screen.getByText(/Belum ada data kehadiran pada rentang ini/)).toBeTruthy(),
        );
    });
});
