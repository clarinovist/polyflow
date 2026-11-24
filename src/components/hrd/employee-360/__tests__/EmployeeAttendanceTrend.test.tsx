// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="recharts-container">{children}</div>
    ),
    BarChart: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="recharts-barchart">{children}</div>
    ),
    Bar: ({ dataKey }: { dataKey: string }) => <div data-testid={`bar-${dataKey}`} />,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Legend: () => null,
}));

vi.mock('@/actions/hrd/attendance-employee', () => ({
    getEmployeeAttendanceTrend: vi.fn(),
}));

import { getEmployeeAttendanceTrend } from '@/actions/hrd/attendance-employee';
import { EmployeeAttendanceTrend } from '../EmployeeAttendanceTrend';

const mockedTrend = vi.mocked(getEmployeeAttendanceTrend);

describe('EmployeeAttendanceTrend', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders stacked bars with mutually exclusive keys when data has activity', async () => {
        mockedTrend.mockResolvedValue({
            success: true,
            data: {
                employeeStatus: 'ACTIVE',
                points: [
                    {
                        year: 2026,
                        month: 5,
                        label: 'Mei 26',
                        workingDays: 26,
                        onTimeDays: 18,
                        lateDays: 2,
                        presentDays: 20,
                        leaveDays: 1,
                        absentDays: 1,
                        missingDays: 4,
                    },
                ],
            },
        } as never);

        render(<EmployeeAttendanceTrend employeeId="e-1" />);
        await waitFor(() => expect(screen.getByTestId('recharts-barchart')).toBeTruthy());
        expect(screen.getByTestId('bar-onTimeDays')).toBeTruthy();
        expect(screen.getByTestId('bar-lateDays')).toBeTruthy();
        expect(screen.getByTestId('bar-leaveDays')).toBeTruthy();
        expect(screen.getByTestId('bar-absentDays')).toBeTruthy();
    });

    it('shows empty state when there is no activity across 6 months', async () => {
        mockedTrend.mockResolvedValue({
            success: true,
            data: {
                employeeStatus: 'ACTIVE',
                points: [
                    {
                        year: 2026,
                        month: 5,
                        label: 'Mei 26',
                        workingDays: 26,
                        onTimeDays: 0,
                        lateDays: 0,
                        presentDays: 0,
                        leaveDays: 0,
                        absentDays: 0,
                        missingDays: 26,
                    },
                ],
            },
        } as never);

        render(<EmployeeAttendanceTrend employeeId="e-1" />);
        await waitFor(() =>
            expect(screen.getByText(/Belum ada catatan kehadiran dalam 6 bulan terakhir/)).toBeTruthy(),
        );
    });

    it('shows error state and retries on failure', async () => {
        mockedTrend.mockResolvedValueOnce({ success: false, error: 'boom' } as never);
        render(<EmployeeAttendanceTrend employeeId="e-1" />);
        await waitFor(() => expect(screen.getByText(/Gagal memuat tren kehadiran/)).toBeTruthy());

        mockedTrend.mockResolvedValueOnce({
            success: true,
            data: { employeeStatus: 'ACTIVE', points: [] },
        } as never);
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        await waitFor(() =>
            expect(screen.getByText(/Belum ada catatan kehadiran dalam 6 bulan terakhir/)).toBeTruthy(),
        );
    });
});
