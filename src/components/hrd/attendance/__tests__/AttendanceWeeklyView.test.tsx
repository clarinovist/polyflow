// @vitest-environment jsdom
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { AttendanceWeeklyView } from '../AttendanceWeeklyView';
import { WEEKLY_ROWS } from './fixtures';

function setup(overrides: Partial<React.ComponentProps<typeof AttendanceWeeklyView>> = {}) {
    const onRetry = vi.fn();
    render(
        <AttendanceWeeklyView
            data={WEEKLY_ROWS}
            loading={false}
            error={null}
            rangeLabel="09 Nov 2026 – 15 Nov 2026"
            onRetry={onRetry}
            {...overrides}
        />,
    );
    return { onRetry };
}

describe('AttendanceWeeklyView', () => {
    it('shows a loading message', () => {
        setup({ loading: true, data: [] });
        expect(screen.getByText('Memuat…')).toBeTruthy();
    });

    it('shows the error with retry', () => {
        const { onRetry } = setup({ error: 'Gagal memuat rekap mingguan', data: [] });
        expect(screen.getByRole('alert').textContent).toContain('Gagal memuat rekap mingguan');
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('shows the empty message with the week range', () => {
        setup({ data: [] });
        expect(
            screen.getByText('Tidak ada data absensi untuk minggu 09 Nov 2026 – 15 Nov 2026'),
        ).toBeTruthy();
    });

    it('renders totals and the estimated wage', () => {
        setup();
        expect(screen.getByText('2 orang')).toBeTruthy();
        expect(screen.getByText('9 hari')).toBeTruthy();
        expect(screen.getByText('72.0j')).toBeTruthy();
        expect(screen.getAllByText('2.0j').some((el) => el.className.includes('text-primary'))).toBe(true);
        expect(screen.getByText(/950\.000/)).toBeTruthy();
    });

    it('renders per-employee earnings', () => {
        setup();
        const row = screen.getByText('Budi Contoh').closest('tr') as HTMLElement;
        const cells = within(row).getAllByRole('cell').map((c) => c.textContent as string);
        expect(cells.slice(0, 5)).toEqual(['E001', 'Budi Contoh', '5', '40.0j', '2.0j']);
        expect(cells[5]).toMatch(/500\.000/);
        expect(cells[6]).toMatch(/50\.000/);
        expect(cells[7]).toMatch(/550\.000/);
    });
});
