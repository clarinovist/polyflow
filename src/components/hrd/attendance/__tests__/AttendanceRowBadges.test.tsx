// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import React from 'react';
import { AttendanceRowBadges } from '../AttendanceRowBadges';

const flags = {
    isLate: false,
    isOutsideRadius: false,
    hasValidSelfie: true,
};

describe('AttendanceRowBadges', () => {
    it('renders nothing for a clean present record', () => {
        const { container } = render(
            <AttendanceRowBadges record={{ status: 'PRESENT', ...flags }} />,
        );

        expect(container.textContent).toBe('');
    });

    it('shows Terlambat, Di luar radius and Tanpa selfie for flagged present records', () => {
        render(
            <AttendanceRowBadges
                record={{
                    status: 'PRESENT',
                    isLate: true,
                    isOutsideRadius: true,
                    hasValidSelfie: false,
                }}
            />,
        );

        expect(screen.getByText('Terlambat')).toBeTruthy();
        expect(screen.getByText('Di luar radius')).toBeTruthy();
        expect(screen.getByText('Tanpa selfie')).toBeTruthy();
    });

    it('labels absent and on-leave records in Indonesian', () => {
        const { rerender } = render(
            <AttendanceRowBadges record={{ status: 'ABSENT', ...flags }} />,
        );
        expect(screen.getByText('Alfa')).toBeTruthy();

        rerender(
            <AttendanceRowBadges record={{ status: 'ON_LEAVE', ...flags }} />,
        );
        expect(screen.getByText('Izin')).toBeTruthy();
        expect(document.body.textContent).not.toMatch(/ABSENT|ON_LEAVE/);
    });

    it('does not flag a missing selfie on non-present records', () => {
        render(
            <AttendanceRowBadges
                record={{ status: 'ABSENT', ...flags, hasValidSelfie: false }}
            />,
        );

        expect(screen.queryByText('Tanpa selfie')).toBeNull();
    });

    it('tolerates records without derived fields', () => {
        const { container } = render(
            <AttendanceRowBadges record={{ status: 'PRESENT' }} />,
        );

        expect(container.textContent).toBe('');
    });
});
