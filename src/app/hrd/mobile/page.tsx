import React from 'react';
import { getHrdMobileOverview } from '@/actions/hrd/mobile-dashboard';
import { MobileInsightCard, MobileSectionHeader } from '@/components/mobile';

export default async function HrdMobilePage() {
    const response = await getHrdMobileOverview();
    const overview = response.success ? response.data : null;

    const highlights = overview?.highlights ?? {
        presentTodayCount: 0,
        pendingLeaveCount: 0,
        attendanceAlertsCount: 0,
        absentYesterdayCount: 0,
        openPayrollPeriodName: undefined,
    };

    return (
        <div className="space-y-6">
            <MobileSectionHeader title="HRD Pulse Hari Ini" />

            <div className="grid grid-cols-2 gap-3">
                <MobileInsightCard
                    insight={{
                        key: 'present-today',
                        label: 'Hadir Hari Ini',
                        value: highlights.presentTodayCount,
                        unit: 'karyawan',
                        severity: 'SUCCESS',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'pending-leave',
                        label: 'Cuti Pending',
                        value: highlights.pendingLeaveCount,
                        unit: 'pengajuan',
                        severity: highlights.pendingLeaveCount > 0 ? 'WARNING' : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'attendance-alerts',
                        label: 'Alert Absensi',
                        value: highlights.attendanceAlertsCount,
                        severity: 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'payroll-period',
                        label: 'Payroll Period',
                        value: highlights.openPayrollPeriodName ?? 'Belum Dibuka',
                        severity: highlights.openPayrollPeriodName ? 'SUCCESS' : 'INFO',
                    }}
                />
            </div>
        </div>
    );
}
