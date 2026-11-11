// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HrdAttendanceCards, HrdFollowUpCard } from '../HealthCards';

const RAW_ENUMS = /PRESENT|ABSENT|ON_LEAVE|NO_RECORD|Attendance|Record|probation/;

const attendance = (over: Record<string, unknown> = {}) =>
    ({
        status: 'AVAILABLE' as const,
        data: {
            present: 8,
            absent: 1,
            onLeave: 2,
            noRecord: 3,
            late: 4,
            outsideRadius: 0,
            noSelfie: 0,
            overtimeHours: 1.5,
            isNonWorkingDay: false,
            ...over,
        },
    }) as never;

describe('HrdAttendanceCards', () => {
    it('shows Indonesian labels for every status incl. late and not-yet-clocked-in', () => {
        const { container } = render(
            <HrdAttendanceCards attendance={attendance()} workDate="2026-09-23" />,
        );
        for (const label of ['Hadir', 'Terlambat', 'Izin', 'Alfa', 'Belum absen'])
            expect(screen.getAllByText(new RegExp(label)).length).toBeGreaterThan(0);
        expect(container.textContent).not.toMatch(RAW_ENUMS);
    });

    it('hides anomaly cards when zero and shows them when positive', () => {
        const { rerender } = render(
            <HrdAttendanceCards attendance={attendance()} workDate="2026-09-23" />,
        );
        expect(screen.queryByText('Di luar radius')).toBeNull();
        expect(screen.queryByText('Tanpa selfie')).toBeNull();
        rerender(
            <HrdAttendanceCards
                attendance={attendance({ outsideRadius: 2, noSelfie: 5 })}
                workDate="2026-09-23"
            />,
        );
        expect(screen.getByText('Di luar radius')).toBeTruthy();
        expect(screen.getByText('Tanpa selfie')).toBeTruthy();
    });

    it('shows a holiday note instead of not-yet-clocked-in on a non-working day', () => {
        render(
            <HrdAttendanceCards
                attendance={attendance({ isNonWorkingDay: true, noRecord: 0 })}
                workDate="2026-09-27"
            />,
        );
        expect(screen.getByText('Hari libur (Minggu)')).toBeTruthy();
        expect(screen.queryByText('Belum absen')).toBeNull();
    });

    it('shows an unavailable state instead of zeros when the read failed', () => {
        render(
            <HrdAttendanceCards
                attendance={{ status: 'UNAVAILABLE', data: null } as never}
                workDate="2026-09-23"
            />,
        );
        expect(screen.getByText(/tidak tersedia/i)).toBeTruthy();
    });

    it('does not show an ISO date as the only date text', () => {
        const { container } = render(
            <HrdAttendanceCards attendance={attendance()} workDate="2026-09-23" />,
        );
        expect(container.textContent).not.toContain('2026-09-23');
    });
});

describe('HrdFollowUpCard', () => {
    it('uses Indonesian wording for probation', () => {
        const { container } = render(
            <HrdFollowUpCard
                followUp={{
                    status: 'AVAILABLE',
                    data: { probation: 1, contract: 2, total: 3, horizonDays: 30 },
                }}
            />,
        );
        expect(container.textContent).toContain('masa percobaan');
        expect(container.textContent).not.toMatch(RAW_ENUMS);
    });
});
