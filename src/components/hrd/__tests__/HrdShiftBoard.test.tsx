// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HrdShiftBoardComponent } from '../HrdShiftBoard';
import type { HrdShiftBoard } from '@/actions/hrd/dashboard-kpis';

const data: HrdShiftBoard = {
    counts: {
        presentToday: 10,
        leavePending: 1,
        loanOutstanding: 250_000,
        loanActiveCount: 1,
        openPayrollPeriods: 1,
        bpjsParticipants: 9,
        hrAlertsUnread: 1,
        absentYesterday: 1,
        periodsNeedGenerate: 1,
    },
    attention: {
        pendingLeaves: [
            {
                id: 'leave-1',
                employeeName: 'Ani',
                type: 'ANNUAL',
                startDate: '2026-09-14',
                daysPending: 2,
            },
        ],
        hrAlerts: [
            { id: 'alert-1', title: 'Kontrak Ani', type: 'HRD_CONTRACT_EXPIRING', createdAt: '2026-09-13' },
        ],
        openPeriods: [
            { id: 'period-1', label: 'September 2026', status: 'OPEN', needsGenerate: true },
        ],
        absentYesterday: [
            { employeeId: 'employee-1', employeeName: 'Budi', employeeCode: 'EMP-1' },
        ],
    },
    today: '2026-09-13',
};

describe('HrdShiftBoardComponent', () => {
    it('keeps positive actionable queues linked to their specific destinations', () => {
        render(<HrdShiftBoardComponent data={data} />);

        expect(
            screen
                .getByText('Cuti menunggu persetujuan')
                .closest('a')
                ?.getAttribute('href'),
        ).toBe('/hrd/leave?status=PENDING');
        expect(
            screen.getByText('Sisa kasbon').closest('a')?.getAttribute('href'),
        ).toBe('/hrd/loans');
        expect(
            screen
                .getByText('Periode terbuka')
                .closest('a')
                ?.getAttribute('href'),
        ).toBe('/hrd/payroll-monthly');
        expect(
            screen
                .getByText('Peringatan HR belum dibaca')
                .closest('a')
                ?.getAttribute('href'),
        ).toBe('/hrd/alerts?unread=true');
        expect(screen.getByText('Ani').closest('a')?.getAttribute('href')).toBe(
            '/hrd/leave?status=PENDING&requestId=leave-1',
        );
        expect(screen.getByText('Kontrak Ani').closest('a')?.getAttribute('href')).toBe(
            '/hrd/alerts?unread=true#alert-alert-1',
        );
        expect(screen.getByText('September 2026').closest('a')?.getAttribute('href')).toBe(
            '/hrd/payroll-monthly/period-1',
        );
        expect(screen.getByText('Budi').closest('a')?.getAttribute('href')).toBe(
            '/dashboard/employees/employee-1?tab=attendance',
        );
    });

    it('keeps observational metrics and zero-count queues informative without action affordances', () => {
        const zeroQueueData: HrdShiftBoard = {
            ...data,
            counts: {
                ...data.counts,
                leavePending: 0,
                loanOutstanding: 0,
                loanActiveCount: 0,
                openPayrollPeriods: 0,
                hrAlertsUnread: 0,
                periodsNeedGenerate: 0,
            },
        };

        render(<HrdShiftBoardComponent data={zeroQueueData} />);

        for (const label of [
            'Hadir hari ini',
            'Peserta BPJS',
            'Cuti menunggu persetujuan',
            'Sisa kasbon',
            'Periode terbuka',
            'Peringatan HR belum dibaca',
        ]) {
            const metric = screen.getByText(label);
            expect(metric.closest('a')).toBeNull();
            expect(
                metric
                    .closest('[data-slot="card"]')
                    ?.classList.contains('cursor-pointer'),
            ).toBe(false);
        }

        expect(screen.queryByText('Proses')).toBeNull();
        expect(screen.queryByText('Lihat')).toBeNull();
        expect(screen.queryByText('Tinjau')).toBeNull();
    });

    it('removes the sitemap-like complete menu while preserving frequent actions', () => {
        render(<HrdShiftBoardComponent data={data} />);

        expect(screen.queryByText('Semua Menu')).not.toBeTruthy();
        expect(screen.getByRole('link', { name: /Rekap Absensi/ })).toBeTruthy();
        expect(
            screen.getByRole('link', { name: 'Gaji Bulanan' }),
        ).toBeTruthy();
    });
});
