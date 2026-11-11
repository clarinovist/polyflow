// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttendanceTodayTile } from '../AttendanceTodayTile';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

type Section = Parameters<typeof AttendanceTodayTile>[0]['section'];

const WORK_DATE = '2026-10-10';

function available(overrides: Partial<NonNullable<Section['data']>> = {}): Section {
    return {
        status: 'AVAILABLE',
        data: {
            present: 8,
            absent: 1,
            onLeave: 2,
            noRecord: 3,
            late: 2,
            outsideRadius: 0,
            noSelfie: 0,
            overtimeHours: 2.25,
            isNonWorkingDay: false,
            ...overrides,
        },
    };
}

function linkHref(name: RegExp): string | null {
    return screen.getByRole('link', { name }).getAttribute('href');
}

afterEach(() => {
    cleanup();
    refresh.mockClear();
});

describe('AttendanceTodayTile', () => {
    it('renders the five status numbers with Indonesian labels', () => {
        render(<AttendanceTodayTile section={available()} workDate={WORK_DATE} />);

        expect(screen.getByText('Status absensi hari ini')).toBeTruthy();
        expect(screen.getByRole('link', { name: /^Hadir\s*8$/ })).toBeTruthy();
        expect(screen.getByRole('link', { name: /^Terlambat.*2$/ })).toBeTruthy();
        expect(screen.getByRole('link', { name: /^Izin\s*2$/ })).toBeTruthy();
        expect(screen.getByRole('link', { name: /^Alfa tercatat\s*1$/ })).toBeTruthy();
        expect(screen.getByRole('link', { name: /^Belum absen\s*3$/ })).toBeTruthy();
    });

    it('never shows raw enum values', () => {
        const { container } = render(
            <AttendanceTodayTile
                section={available({ outsideRadius: 1, noSelfie: 1 })}
                workDate={WORK_DATE}
            />,
        );

        for (const raw of ['PRESENT', 'NO_RECORD', 'ABSENT', 'ON_LEAVE']) {
            expect(container.textContent).not.toContain(raw);
        }
    });

    it('links each number to the attendance recap with the shared filter and date', () => {
        render(
            <AttendanceTodayTile
                section={available({ outsideRadius: 1, noSelfie: 4 })}
                workDate={WORK_DATE}
            />,
        );

        const base = '/hrd/attendance?';
        expect(linkHref(/^Hadir/)).toBe(base + 'date=' + WORK_DATE);
        expect(linkHref(/^Terlambat/)).toBe(base + 'status=late&date=' + WORK_DATE);
        expect(linkHref(/^Izin/)).toBe(base + 'status=leave&date=' + WORK_DATE);
        expect(linkHref(/^Alfa tercatat/)).toBe(base + 'status=absent&date=' + WORK_DATE);
        expect(linkHref(/^Belum absen/)).toBe(base + 'status=norecord&date=' + WORK_DATE);
        expect(linkHref(/^Di luar radius/)).toBe(base + 'status=outside&date=' + WORK_DATE);
        expect(linkHref(/^Tanpa selfie/)).toBe(base + 'status=nophoto&date=' + WORK_DATE);
    });

    it('hides anomaly rows when their counts are zero', () => {
        render(<AttendanceTodayTile section={available()} workDate={WORK_DATE} />);

        expect(screen.queryByText('Di luar radius')).toBeNull();
        expect(screen.queryByText('Tanpa selfie')).toBeNull();
    });

    it('shows only the anomaly rows that are above zero', () => {
        render(
            <AttendanceTodayTile
                section={available({ outsideRadius: 3 })}
                workDate={WORK_DATE}
            />,
        );

        expect(screen.getByRole('link', { name: /^Di luar radius\s*3$/ })).toBeTruthy();
        expect(screen.queryByText('Tanpa selfie')).toBeNull();
    });

    it('shows the overtime hours supporting line', () => {
        render(<AttendanceTodayTile section={available()} workDate={WORK_DATE} />);

        expect(screen.getByText(/2,25 jam lembur/)).toBeTruthy();
    });

    it('renders valid zeroes as numbers rather than an unavailable state', () => {
        render(
            <AttendanceTodayTile
                section={available({
                    present: 0,
                    absent: 0,
                    onLeave: 0,
                    noRecord: 0,
                    late: 0,
                    overtimeHours: 0,
                })}
                workDate={WORK_DATE}
            />,
        );

        expect(screen.getByRole('link', { name: /^Hadir\s*0$/ })).toBeTruthy();
        expect(screen.queryByText(/tidak tersedia/i)).toBeNull();
    });

    it('shows a holiday label instead of "Belum absen" on Sunday', () => {
        render(
            <AttendanceTodayTile
                section={available({ isNonWorkingDay: true, noRecord: 0 })}
                workDate="2026-10-11"
            />,
        );

        expect(screen.getByText('Hari libur (Minggu)')).toBeTruthy();
        expect(screen.queryByText('Belum absen')).toBeNull();
        expect(screen.queryByRole('link', { name: /Belum absen/ })).toBeNull();
    });

    it('shows an error state with a retry button when the section is unavailable', () => {
        render(
            <AttendanceTodayTile
                section={{ status: 'UNAVAILABLE', data: null }}
                workDate={WORK_DATE}
            />,
        );

        expect(screen.getByText(/Status absensi hari ini tidak tersedia/)).toBeTruthy();
        expect(screen.queryByRole('link', { name: /^Hadir/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('distinguishes the not-configured state from the error state', () => {
        render(
            <AttendanceTodayTile
                section={{ status: 'NOT_CONFIGURED', data: null }}
                workDate={WORK_DATE}
            />,
        );

        expect(screen.getByText('Belum disiapkan')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Coba lagi' })).toBeNull();
    });
});
