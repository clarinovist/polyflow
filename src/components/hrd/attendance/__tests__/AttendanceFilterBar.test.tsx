// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { AttendanceFilterBar } from '../AttendanceFilterBar';

function setup(status: 'all' | 'late' = 'all', query = '') {
    const onStatusChange = vi.fn();
    const onQueryChange = vi.fn();
    render(
        <AttendanceFilterBar
            status={status}
            query={query}
            onStatusChange={onStatusChange}
            onQueryChange={onQueryChange}
        />,
    );
    return { onStatusChange, onQueryChange };
}

describe('AttendanceFilterBar', () => {
    it('offers every status with Indonesian labels', () => {
        setup();

        const select = screen.getByLabelText('Status') as HTMLSelectElement;
        const labels = Array.from(select.options).map((o) => o.textContent);

        expect(labels).toEqual([
            'Semua status',
            'Hadir',
            'Terlambat',
            'Izin',
            'Alfa',
            'Belum absen',
            'Di luar radius',
            'Tanpa selfie',
            'Lupa pulang',
        ]);
    });

    it('reports a status change', () => {
        const { onStatusChange } = setup();

        fireEvent.change(screen.getByLabelText('Status'), {
            target: { value: 'late' },
        });

        expect(onStatusChange).toHaveBeenCalledWith('late');
    });

    it('reflects the current status and query', () => {
        setup('late', 'budi');

        expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('late');
        expect((screen.getByLabelText('Cari karyawan') as HTMLInputElement).value).toBe('budi');
    });

    it('reports search input', () => {
        const { onQueryChange } = setup();

        fireEvent.change(screen.getByLabelText('Cari karyawan'), {
            target: { value: 'sit' },
        });

        expect(onQueryChange).toHaveBeenCalledWith('sit');
    });
});
