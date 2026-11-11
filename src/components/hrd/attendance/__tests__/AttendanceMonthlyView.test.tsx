// @vitest-environment jsdom
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { AttendanceMonthlyView } from '../AttendanceMonthlyView';
import { MONTHLY_ROWS } from './fixtures';

function setup(overrides: Partial<React.ComponentProps<typeof AttendanceMonthlyView>> = {}) {
    const onRetry = vi.fn();
    render(
        <AttendanceMonthlyView
            data={MONTHLY_ROWS}
            loading={false}
            error={null}
            year={2026}
            month={11}
            onRetry={onRetry}
            {...overrides}
        />,
    );
    return { onRetry };
}

describe('AttendanceMonthlyView', () => {
    it('shows a loading message', () => {
        setup({ loading: true, data: [] });
        expect(screen.getByText('Memuat…')).toBeTruthy();
    });

    it('prefers the error over empty data and retries', () => {
        const { onRetry } = setup({ error: 'Gagal memuat rekap bulanan', data: [] });
        expect(screen.getByRole('alert').textContent).toContain('Gagal memuat rekap bulanan');
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('shows the empty message with month name and year', () => {
        setup({ data: [], month: 3, year: 2025 });
        expect(screen.getByText('Tidak ada data absensi untuk Maret 2025')).toBeTruthy();
    });

    it('renders totals across employees', () => {
        setup();
        expect(screen.getByText('2 orang')).toBeTruthy();
        expect(screen.getByText('42 hari')).toBeTruthy();
        expect(screen.getByText('Total Alfa')).toBeTruthy();
        expect(screen.getByText('2 hari')).toBeTruthy();
        expect(screen.getByText('330.3j')).toBeTruthy();
        expect(screen.getAllByText('4.5j')).toHaveLength(2);
    });

    it('renders one row per employee, badging absences only when above zero', () => {
        setup();
        const budi = screen.getByText('Budi Contoh').closest('tr') as HTMLElement;
        expect(within(budi).getAllByRole('cell').map((c) => c.textContent)).toEqual([
            'E001', 'Budi Contoh', '20', '2', '1', '3', '160.3j', '4.5j',
        ]);
        const siti = screen.getByText('Siti Contoh').closest('tr') as HTMLElement;
        expect(within(siti).getAllByRole('cell')[3].textContent).toBe('0');
    });
});
