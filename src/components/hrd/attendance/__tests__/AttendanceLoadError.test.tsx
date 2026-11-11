// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { AttendanceLoadError } from '../AttendanceLoadError';

describe('AttendanceLoadError', () => {
    it('shows the message as an alert and retries on click', () => {
        const onRetry = vi.fn();
        render(<AttendanceLoadError message="Gagal memuat rekap bulanan" onRetry={onRetry} />);

        expect(screen.getByRole('alert').textContent).toContain(
            'Gagal memuat rekap bulanan',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });
});
