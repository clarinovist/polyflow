// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { AttendanceSummaryChips } from '../AttendanceSummaryChips';
import type { AttendanceSummaryCounts } from '../attendance-recap-helpers';

const COUNTS: AttendanceSummaryCounts = {
    present: 12,
    late: 3,
    onLeave: 2,
    absent: 1,
    noRecord: 4,
    outsideRadius: 0,
    noSelfie: 0,
};

function setup(
    counts: Partial<AttendanceSummaryCounts> = {},
    props: Partial<React.ComponentProps<typeof AttendanceSummaryChips>> = {},
) {
    const onSelect = vi.fn();
    render(
        <AttendanceSummaryChips
            counts={{ ...COUNTS, ...counts }}
            active="all"
            isNonWorkingDay={false}
            onSelect={onSelect}
            {...props}
        />,
    );
    return { onSelect };
}

const chip = (name: RegExp) => screen.getByRole('button', { name });

describe('AttendanceSummaryChips', () => {
    it('shows the five summary chips with Indonesian labels and counts', () => {
        setup();

        expect(chip(/^Hadir/).textContent).toContain('12');
        expect(chip(/^Terlambat/).textContent).toContain('3');
        expect(chip(/^Izin/).textContent).toContain('2');
        expect(chip(/^Alfa/).textContent).toContain('1');
        expect(chip(/^Belum absen/).textContent).toContain('4');
    });

    it('separates label and count so screen readers read "Hadir 12"', () => {
        setup();

        expect(chip(/^Hadir 12$/)).toBeTruthy();
    });

    it('never renders raw enum names', () => {
        setup();

        expect(document.body.textContent).not.toMatch(
            /NO_RECORD|ON_LEAVE|ABSENT|PRESENT/,
        );
    });

    it('selects the matching filter when a chip is clicked', () => {
        const { onSelect } = setup();

        fireEvent.click(chip(/^Terlambat/));
        fireEvent.click(chip(/^Belum absen/));
        fireEvent.click(chip(/^Izin/));
        fireEvent.click(chip(/^Alfa/));
        fireEvent.click(chip(/^Hadir/));

        expect(onSelect.mock.calls.map((c) => c[0])).toEqual([
            'late',
            'norecord',
            'leave',
            'absent',
            'present',
        ]);
    });

    it('marks the active chip and clears the filter when it is clicked again', () => {
        const { onSelect } = setup({}, { active: 'late' });

        expect(chip(/^Terlambat/).getAttribute('aria-pressed')).toBe('true');
        expect(chip(/^Hadir/).getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(chip(/^Terlambat/));
        expect(onSelect).toHaveBeenCalledWith('all');
    });

    it('shows a placeholder, not zero, while the no-record count is unavailable', () => {
        setup({ noRecord: null });

        expect(chip(/^Belum absen/).textContent).not.toMatch(/\b0\b/);
        expect(chip(/^Belum absen/).textContent).toContain('…');
    });

    it('shows a holiday note on a non-working day instead of a count', () => {
        setup({ noRecord: 0 }, { isNonWorkingDay: true });

        expect(chip(/^Belum absen/).textContent).toContain('Libur');
    });

    it('hides anomaly chips at zero and shows them when above zero', () => {
        setup();
        expect(screen.queryByRole('button', { name: /Di luar radius/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Tanpa selfie/ })).toBeNull();
    });

    it('shows anomaly chips with counts when present', () => {
        const { onSelect } = setup({ outsideRadius: 2, noSelfie: 5 });

        expect(chip(/Di luar radius/).textContent).toContain('2');
        expect(chip(/Tanpa selfie/).textContent).toContain('5');
        fireEvent.click(chip(/Tanpa selfie/));
        expect(onSelect).toHaveBeenCalledWith('nophoto');
    });
});
