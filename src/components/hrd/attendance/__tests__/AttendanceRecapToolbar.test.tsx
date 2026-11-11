// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import React from 'react';
import { AttendanceRecapToolbar } from '../AttendanceRecapToolbar';

const SHIFTS = [
    { id: 's1', name: 'Pagi', startTime: '07:00', endTime: '15:00', status: 'ACTIVE' },
    { id: 's2', name: 'Malam', startTime: '19:00', endTime: '03:00', status: 'ACTIVE' },
    { id: 's3', name: 'Lama', startTime: '01:00', endTime: '02:00', status: 'INACTIVE' },
];

beforeAll(() => {
    const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.scrollIntoView = vi.fn();
    proto.hasPointerCapture = vi.fn(() => false);
    proto.releasePointerCapture = vi.fn();
    proto.setPointerCapture = vi.fn();
});

function setup(overrides: Partial<React.ComponentProps<typeof AttendanceRecapToolbar>> = {}) {
    const handlers = {
        onSwitchMode: vi.fn(),
        onParamChange: vi.fn(),
        onMonthChange: vi.fn(),
        onYearChange: vi.fn(),
    };
    render(
        <AttendanceRecapToolbar
            viewMode="daily"
            currentDate="2026-11-10"
            overtimeOnly={false}
            shifts={SHIFTS}
            year={2026}
            month={11}
            weekRangeLabel="09 Nov 2026 – 15 Nov 2026"
            exportHref="/api/hrd/attendance/export?mode=daily&date=2026-11-10"
            {...handlers}
            {...overrides}
        />,
    );
    return handlers;
}

describe('AttendanceRecapToolbar', () => {
    it('switches mode from the tabs', () => {
        const { onSwitchMode } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Mingguan' }));
        fireEvent.click(screen.getByRole('button', { name: 'Bulanan' }));
        fireEvent.click(screen.getByRole('button', { name: 'Harian' }));
        expect(onSwitchMode.mock.calls.map((c) => c[0])).toEqual(['weekly', 'monthly', 'daily']);
    });

    it('renders the export link as an anchor with the given href', () => {
        setup();
        const link = screen.getByRole('link', { name: /CSV/ });
        expect(link.closest('button')).toBeNull();
        expect(link.getAttribute('href')).toBe('/api/hrd/attendance/export?mode=daily&date=2026-11-10');
    });

    it('daily: reports date, overtime and shift changes', async () => {
        const { onParamChange } = setup({ currentShift: 's1' });
        fireEvent.change(screen.getByDisplayValue('2026-11-10'), { target: { value: '2026-11-12' } });
        expect(onParamChange).toHaveBeenCalledWith('date', '2026-11-12');
        fireEvent.click(screen.getByRole('button', { name: 'Filter Lembur' }));
        expect(onParamChange).toHaveBeenCalledWith('ot', '1');
        fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
        expect(screen.queryByRole('option', { name: 'Lama' })).toBeNull();
        fireEvent.click(await screen.findByRole('option', { name: 'Malam' }));
        expect(onParamChange).toHaveBeenCalledWith('shift', 's2');
    });

    it('daily: clears overtime and shift filters', async () => {
        const { onParamChange } = setup({ overtimeOnly: true, currentShift: 's1' });
        fireEvent.click(screen.getByRole('button', { name: 'Lembur ON' }));
        expect(onParamChange).toHaveBeenCalledWith('ot', null);
        fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
        fireEvent.click(await screen.findByRole('option', { name: 'Semua shift' }));
        expect(onParamChange).toHaveBeenCalledWith('shift', null);
    });

    it('weekly: shows the range, payroll link and date picker', () => {
        const { onParamChange } = setup({ viewMode: 'weekly' });
        expect(screen.getByText('09 Nov 2026 – 15 Nov 2026')).toBeTruthy();
        expect(screen.getByRole('link', { name: '→ Gaji Mingguan' }).getAttribute('href')).toBe(
            '/hrd/payroll?date=2026-11-10',
        );
        fireEvent.change(screen.getByDisplayValue('2026-11-10'), { target: { value: '2026-11-17' } });
        expect(onParamChange).toHaveBeenCalledWith('date', '2026-11-17');
        expect(screen.queryByRole('button', { name: 'Filter Lembur' })).toBeNull();
    });

    it('monthly: reports month and year changes and links to monthly payroll', async () => {
        const { onMonthChange, onYearChange } = setup({ viewMode: 'monthly' });
        expect(screen.getByRole('link', { name: '→ Gaji Bulanan' }).getAttribute('href')).toBe(
            '/hrd/payroll-monthly',
        );
        const [monthTrigger, yearTrigger] = screen.getAllByRole('combobox');
        expect(monthTrigger.textContent).toContain('November');
        expect(yearTrigger.textContent).toContain('2026');
        fireEvent.keyDown(monthTrigger, { key: 'Enter' });
        fireEvent.click(await screen.findByRole('option', { name: 'Maret' }));
        expect(onMonthChange).toHaveBeenCalledWith('3');
        fireEvent.keyDown(yearTrigger, { key: 'Enter' });
        fireEvent.click(await screen.findByRole('option', { name: '2025' }));
        expect(onYearChange).toHaveBeenCalledWith('2025');
    });
});
