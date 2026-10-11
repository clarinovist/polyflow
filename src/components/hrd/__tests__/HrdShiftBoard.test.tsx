// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HrdShiftBoardComponent } from '../HrdShiftBoard';
import type { HrdShiftBoard } from '@/actions/hrd/dashboard-kpis';

function section<T>(data: T) {
    return { status: 'AVAILABLE' as const, data };
}

const data: HrdShiftBoard = {
    generatedAt: '2026-10-10T00:00:00.000Z',
    workDate: '2026-10-10',
    yesterdayWorkDate: '2026-10-09',
    health: {
        activeHeadcount: section({ count: 10 }),
        attendanceToday: section({
            present: 8,
            absent: 1,
            onLeave: 1,
            overtimeHours: 2.25,
        }),
        payrollReadiness: section({
            year: 2026,
            month: 10,
            total: 5,
            draft: 1,
            finalized: 2,
            paid: 2,
        }),
        employmentFollowUp: section({
            probation: 1,
            contract: 2,
            total: 3,
            horizonDays: 30 as const,
        }),
    },
    attention: {
        pendingLeave: section({ count: 2 }),
        loanPortfolio: section({
            activeCount: 1,
            outstandingAmount: 250_000,
        }),
        payroll: section({ openPeriods: 1, periodsNeedGenerate: 1 }),
        bpjs: section({ activeParticipants: 9 }),
        hrAlerts: section({ unreadRecipientNotifications: 4 }),
        recordedAbsenceYesterday: section({ count: 2 }),
    },
    drivers: { status: 'NOT_CONFIGURED', data: null },
};

describe('HrdShiftBoardComponent', () => {
    it('renders condition → attention → direction with formulas, freshness, and safe root links', () => {
        render(<HrdShiftBoardComponent data={data} />);

        const health = screen.getByText('Kondisi');
        const attention = screen.getByText('Perlu perhatian');
        const drivers = screen.getByText('Arah utama');
        expect(
            health.compareDocumentPosition(attention) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            attention.compareDocumentPosition(drivers) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(screen.getByText(/Diperbarui/)).toBeTruthy();
        expect(screen.getByText('8 hadir')).toBeTruthy();
        expect(
            screen.getByText(/1 tidak hadir · 1 cuti\/izin · 2,25 jam lembur/),
        ).toBeTruthy();
        expect(screen.getByText('5 slip dibuat')).toBeTruthy();
        expect(
            screen.getByText(/1 draf · 2 diselesaikan · 2 dibayar/),
        ).toBeTruthy();
        expect(screen.getByText('3')).toBeTruthy();
        expect(
            screen
                .getByText('Cuti/izin menunggu')
                .closest('a')
                ?.getAttribute('href'),
        ).toBe('/hrd/leave?status=PENDING');
        expect(
            screen.getByText('Kasbon aktif').closest('a')?.getAttribute('href'),
        ).toBe('/hrd/loans');
        expect(
            screen
                .getByText('Periode payroll terbuka')
                .closest('a')
                ?.getAttribute('href'),
        ).toBe('/hrd/payroll-monthly');
        expect(
            screen
                .getByText('Tidak hadir tercatat kemarin')
                .closest('a')
                ?.getAttribute('href'),
        ).toBe('/hrd/attendance');
        expect(screen.getByText(/Pendorong per unit atau sif belum/)).toBeTruthy();
        expect(screen.getByText(/tidak menyimpulkan penyebab/i)).toBeTruthy();
    });

    it('renders valid zeroes as AVAILABLE rather than unavailable', () => {
        const zero: HrdShiftBoard = {
            ...data,
            health: {
                activeHeadcount: section({ count: 0 }),
                attendanceToday: section({
                    present: 0,
                    absent: 0,
                    onLeave: 0,
                    overtimeHours: 0,
                }),
                payrollReadiness: section({
                    year: 2026,
                    month: 10,
                    total: 0,
                    draft: 0,
                    finalized: 0,
                    paid: 0,
                }),
                employmentFollowUp: section({
                    probation: 0,
                    contract: 0,
                    total: 0,
                    horizonDays: 30 as const,
                }),
            },
        };

        render(<HrdShiftBoardComponent data={zero} />);

        expect(screen.getByText('0 hadir')).toBeTruthy();
        expect(screen.getByText('0 slip dibuat')).toBeTruthy();
        expect(screen.queryByText('Absensi tercatat tidak tersedia')).toBeNull();
    });

    it('renders independent unavailable and payroll not-configured states without synthetic values', () => {
        const partial: HrdShiftBoard = {
            ...data,
            health: {
                ...data.health,
                attendanceToday: { status: 'UNAVAILABLE', data: null },
                payrollReadiness: { status: 'NOT_CONFIGURED', data: null },
            },
            attention: {
                ...data.attention,
                pendingLeave: { status: 'UNAVAILABLE', data: null },
            },
        };

        render(<HrdShiftBoardComponent data={partial} />);

        expect(screen.getAllByText('Data tidak tersedia').length).toBeGreaterThan(
            0,
        );
        expect(screen.getByText('Belum disiapkan')).toBeTruthy();
        expect(screen.queryByText('0 hadir')).toBeNull();
        expect(screen.getByText(/Rp\s*250\.000/)).toBeTruthy();
    });

    it('renders a whole-action failure explicitly and no zero dashboard', () => {
        render(<HrdShiftBoardComponent data={null} />);

        expect(screen.getByText('Dashboard HRD tidak tersedia')).toBeTruthy();
        expect(screen.getByText(/Angka kosong tidak dianggap nol/)).toBeTruthy();
        expect(screen.queryByText('0 hadir')).toBeNull();
    });

    it('does not render personal names, codes, identifiers, or notification text', () => {
        render(<HrdShiftBoardComponent data={data} />);

        for (const forbidden of [
            'Synthetic Personal Name',
            'EMP-001',
            'employee-1',
            'Kontrak Ani berakhir',
            '1234567890',
        ]) {
            expect(screen.queryByText(forbidden)).toBeNull();
        }
        expect(screen.queryByText(/requestId=/)).toBeNull();
        expect(screen.queryByText(/attendance rate/i)).toBeNull();
        expect(
            screen.getByRole('button', {
                name: 'Penjelasan Status absensi tercatat hari ini',
            }),
        ).toBeTruthy();
        expect(screen.queryByText(/turnover/i)).toBeNull();
    });
});
