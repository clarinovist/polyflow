// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { AttendanceSelfieThumbs } from '../AttendanceSelfieThumbs';
import { RECORD } from './fixtures';

describe('AttendanceSelfieThumbs', () => {
    it('opens the clock-in selfie preview', () => {
        const onPreview = vi.fn();
        render(<AttendanceSelfieThumbs record={RECORD} onPreview={onPreview} />);
        expect(screen.getByAltText('Selfie masuk Budi Contoh')).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Lihat selfie masuk Budi Contoh'));
        expect(onPreview).toHaveBeenCalledWith({
            url: '/api/images/acme/attendance/e1/a.jpg',
            title: 'Budi Contoh — Masuk',
        });
    });

    it('opens the clock-out selfie preview when present', () => {
        const onPreview = vi.fn();
        render(
            <AttendanceSelfieThumbs
                record={{ ...RECORD, clockOutPhotoUrl: '/api/images/acme/attendance/e1/b.jpg' }}
                onPreview={onPreview}
            />,
        );
        fireEvent.click(screen.getByLabelText('Lihat selfie pulang Budi Contoh'));
        expect(onPreview).toHaveBeenCalledWith({
            url: '/api/images/acme/attendance/e1/b.jpg',
            title: 'Budi Contoh — Pulang',
        });
    });

    it('shows a dash when there is no clock-in photo or the selfie is invalid', () => {
        const { rerender } = render(
            <AttendanceSelfieThumbs record={{ ...RECORD, clockInPhotoUrl: null }} onPreview={vi.fn()} />,
        );
        expect(screen.getByText('-')).toBeTruthy();
        expect(screen.queryByLabelText(/Lihat selfie/)).toBeNull();
        rerender(
            <AttendanceSelfieThumbs record={{ ...RECORD, hasValidSelfie: false }} onPreview={vi.fn()} />,
        );
        expect(screen.getByText('-')).toBeTruthy();
        expect(screen.queryByLabelText(/Lihat selfie/)).toBeNull();
    });

    it('treats an unknown selfie validity as valid', () => {
        render(
            <AttendanceSelfieThumbs record={{ ...RECORD, hasValidSelfie: undefined }} onPreview={vi.fn()} />,
        );
        expect(screen.getByLabelText('Lihat selfie masuk Budi Contoh')).toBeTruthy();
    });
});
