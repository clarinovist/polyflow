// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { CorrectAttendanceDialog } from '../CorrectAttendanceDialog';
import { RECORD } from './fixtures';

const FORM = { clockInAt: '2026-11-10T07:00', clockOutAt: '', notes: '' };

function setup(overrides: Partial<React.ComponentProps<typeof CorrectAttendanceDialog>> = {}) {
    const handlers = { onFieldChange: vi.fn(), onClose: vi.fn(), onSubmit: vi.fn() };
    render(
        <CorrectAttendanceDialog
            record={RECORD}
            form={FORM}
            loading={false}
            {...handlers}
            {...overrides}
        />,
    );
    return handlers;
}

describe('CorrectAttendanceDialog', () => {
    it('renders nothing without a record', () => {
        setup({ record: null });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('shows the employee name and form values', () => {
        setup();
        expect(screen.getByText('Koreksi Absensi — Budi Contoh')).toBeTruthy();
        expect((screen.getByLabelText('Jam Masuk') as HTMLInputElement).value).toBe(FORM.clockInAt);
        expect((screen.getByLabelText('Jam Pulang') as HTMLInputElement).value).toBe('');
    });

    it('reports each field change', () => {
        const { onFieldChange } = setup();
        fireEvent.change(screen.getByLabelText('Jam Masuk'), { target: { value: '2026-11-10T06:00' } });
        fireEvent.change(screen.getByLabelText('Jam Pulang'), { target: { value: '2026-11-10T16:00' } });
        fireEvent.change(screen.getByLabelText('Catatan'), { target: { value: 'Alasan' } });
        expect(onFieldChange).toHaveBeenCalledWith('clockInAt', '2026-11-10T06:00');
        expect(onFieldChange).toHaveBeenCalledWith('clockOutAt', '2026-11-10T16:00');
        expect(onFieldChange).toHaveBeenCalledWith('notes', 'Alasan');
    });

    it('submits and cancels', () => {
        const { onSubmit, onClose } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Simpan Koreksi' }));
        expect(onSubmit).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes when dismissed with Escape', () => {
        const { onClose } = setup();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('disables saving and shows progress while loading', () => {
        setup({ loading: true });
        const button = screen.getByRole('button', { name: 'Menyimpan...' }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
    });
});
