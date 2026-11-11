// @vitest-environment jsdom
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { AttendanceDailyTable } from '../AttendanceDailyTable';
import { RECORD } from './fixtures';

function setup(
    overrides: Partial<React.ComponentProps<typeof AttendanceDailyTable>> = {},
) {
    const handlers = { onPreview: vi.fn(), onCorrect: vi.fn() };
    render(
        <AttendanceDailyTable
            records={[RECORD]}
            totalCount={1}
            actionsDisabled={false}
            {...handlers}
            {...overrides}
        />,
    );
    return handlers;
}

function cellTexts(name: string): (string | null)[] {
    const row = screen.getByText(name).closest('tr') as HTMLElement;
    return within(row).getAllByRole('cell').map((c) => c.textContent);
}

describe('AttendanceDailyTable', () => {
    it('renders all twelve column headers', () => {
        setup();
        const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
        expect(headers).toEqual([
            'Kode', 'Nama', 'Foto', 'Shift', 'Rencana', 'Masuk', 'Pulang',
            'Aktual', 'OT', 'Shift Ganda', 'Sumber', 'Aksi',
        ]);
    });

    it('renders a row with times, hours and badges', () => {
        setup({
            records: [
                {
                    ...RECORD,
                    clockOutAt: '2026-11-10T08:30:00.000Z',
                    actualHours: 8.5,
                    overtimeHours: 1.5,
                    isOvertimeShift: true,
                    isLate: true,
                },
            ],
        });
        const cells = cellTexts('Budi Contoh');
        expect(cells[0]).toBe('E001');
        expect(cells[1]).toContain('Terlambat');
        expect(cells.slice(3, 10)).toEqual(['Pagi', '8.0j', '07.00', '15.30', '8.5j', '+1.5j', 'Ya']);
    });

    it('shows dashes for missing values', () => {
        setup();
        const cells = cellTexts('Budi Contoh');
        expect(cells.slice(6, 10)).toEqual(['-', '-', '-', '']);
    });

    it('shows the empty message when there are no records at all', () => {
        setup({ records: [], totalCount: 0 });
        expect(screen.getByText('Tidak ada data absensi untuk tanggal ini')).toBeTruthy();
    });

    it('shows the no-match message when a filter hides every record', () => {
        setup({ records: [], totalCount: 3 });
        expect(screen.getByText('Tidak ada data yang cocok dengan filter')).toBeTruthy();
    });

    it('forwards selfie previews', () => {
        const { onPreview } = setup();
        fireEvent.click(screen.getByLabelText('Lihat selfie masuk Budi Contoh'));
        expect(onPreview).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Budi Contoh — Masuk' }),
        );
    });

    it('opens the correction action from the row menu', async () => {
        const { onCorrect } = setup();
        const row = screen.getByText('Budi Contoh').closest('tr') as HTMLElement;
        fireEvent.keyDown(within(row).getByRole('button', { name: '' }), { key: 'Enter' });
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Koreksi Jam' }));
        expect(onCorrect).toHaveBeenCalledWith(RECORD);
    });

    it('disables the row menu while actions are disabled', () => {
        setup({ actionsDisabled: true });
        const row = screen.getByText('Budi Contoh').closest('tr') as HTMLElement;
        expect((within(row).getByRole('button', { name: '' }) as HTMLButtonElement).disabled).toBe(true);
    });
});
