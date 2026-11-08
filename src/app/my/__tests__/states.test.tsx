// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MyError from '../error';
import MyLoading from '../loading';
import KioskError from '../../kiosk/error';
import KioskLoading from '../../kiosk/loading';

describe('employee portal and kiosk fallback states', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('shows a status heading while the employee portal loads', () => {
        render(<MyLoading />);

        expect(
            screen.getByRole('heading', { name: 'Memuat Portal Karyawan' }),
        ).toBeTruthy();
        expect(screen.getByRole('status')).toBeTruthy();
    });

    it('lets the employee retry after an error and logs the cause', () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const retry = vi.fn();
        render(<MyError error={new Error('boom')} retry={retry} />);

        fireEvent.click(screen.getByRole('button', { name: /coba lagi/i }));

        expect(retry).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalled();
    });

    it('shows a large loading status on the kiosk', () => {
        render(<KioskLoading />);

        expect(
            screen.getByRole('heading', { name: 'Memuat kiosk…' }),
        ).toBeTruthy();
    });

    it('lets the kiosk operator retry without losing production data', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const retry = vi.fn();
        render(<KioskError error={new Error('boom')} retry={retry} />);

        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));

        expect(retry).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('alert').textContent).toContain(
            'Data produksi tidak diubah',
        );
    });
});
