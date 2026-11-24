// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { AttendanceMonthCalendar } from '../AttendanceMonthCalendar';
import type { DayOutcomeEntry } from '@/services/hrd/attendance-day-outcomes';

const DAYS: DayOutcomeEntry[] = [
    { date: '2026-06-01', outcome: 'present', status: 'present', isLate: false, hasRecord: true },
    { date: '2026-06-02', outcome: 'present', status: 'late', isLate: true, hasRecord: true },
    { date: '2026-06-03', outcome: 'paidLeave', status: 'paidLeave', isLate: false, hasRecord: false },
    { date: '2026-06-04', outcome: 'deductibleLeave', status: 'deductibleLeave', isLate: false, hasRecord: false },
    { date: '2026-06-05', outcome: 'absent', status: 'absent', isLate: false, hasRecord: true },
    { date: '2026-06-06', outcome: 'missing', status: 'missing', isLate: false, hasRecord: false },
    { date: '2026-06-07', outcome: null, status: 'sunday', isLate: false, hasRecord: true },
];

describe('AttendanceMonthCalendar', () => {
    it('renders legend, weekday headers, Sunday overtime dot, and forwards date selection', () => {
        const onSelectDate = vi.fn();
        render(
            <AttendanceMonthCalendar
                year={2026}
                month={6}
                days={DAYS}
                selectedDate="2026-06-02"
                onSelectDate={onSelectDate}
            />,
        );

        expect(screen.getByText('Sen')).toBeTruthy();
        expect(screen.getByText('Min')).toBeTruthy();
        const legend = screen.getByLabelText('Legenda kalender');
        expect(legend.textContent).toContain('Hadir');
        expect(legend.textContent).toContain('Terlambat');
        expect(legend.textContent).toContain('Izin dibayar');
        expect(legend.textContent).toContain('Izin dipotong');
        expect(legend.textContent).toContain('Alfa');
        expect(legend.textContent).toContain('Tanpa catatan');

        const selectedBtn = screen.getByRole('button', { name: /2026-06-02/ });
        expect(selectedBtn.getAttribute('aria-pressed')).toBe('true');

        fireEvent.click(screen.getByRole('button', { name: /2026-06-01/ }));
        expect(onSelectDate).toHaveBeenCalledWith('2026-06-01');
        expect(screen.getByTitle('Ada catatan lembur hari Minggu')).toBeTruthy();
    });

    it('shows inactive employee note when isInactiveEmployee is true', () => {
        render(
            <AttendanceMonthCalendar
                year={2026}
                month={6}
                days={DAYS}
                selectedDate={null}
                isInactiveEmployee
                onSelectDate={vi.fn()}
            />,
        );

        expect(screen.getByText(/Karyawan berstatus nonaktif/)).toBeTruthy();
    });
});
