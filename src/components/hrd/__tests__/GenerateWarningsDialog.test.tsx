// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { GenerateWarningsDialog } from '../GenerateWarningsDialog';

const WARNINGS = [
    { employeeId: 'e-1', employeeName: 'Budi Contoh', missingDays: 3 },
    { employeeId: 'e-2', employeeName: 'Siti Contoh', missingDays: 1 },
];

function setup(warnings = WARNINGS) {
    const onClose = vi.fn();
    render(<GenerateWarningsDialog warnings={warnings} onClose={onClose} />);
    return { onClose };
}

describe('GenerateWarningsDialog', () => {
    it('summarises how many employees have workdays without attendance records', () => {
        setup();

        expect(
            screen.getByText(/2 karyawan punya hari kerja tanpa catatan absensi/),
        ).toBeTruthy();
    });

    it('lists each employee with the number of days', () => {
        setup();

        expect(screen.getByText('Budi Contoh')).toBeTruthy();
        expect(screen.getByText('3 hari')).toBeTruthy();
        expect(screen.getByText('Siti Contoh')).toBeTruthy();
        expect(screen.getByText('1 hari')).toBeTruthy();
    });

    it('states honestly that national holidays are not recognised and nothing was auto-deducted', () => {
        setup();

        expect(screen.getByText(/libur nasional tidak dikenali/i)).toBeTruthy();
        expect(screen.getByText(/tidak dipotong otomatis/i)).toBeTruthy();
    });

    it('renders nothing when there are no warnings', () => {
        setup([]);

        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('calls onClose when acknowledged', () => {
        const { onClose } = setup();

        fireEvent.click(screen.getByRole('button', { name: 'Mengerti' }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
