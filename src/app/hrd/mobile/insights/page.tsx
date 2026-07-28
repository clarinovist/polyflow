import React from 'react';
import { getHrdMobileOverview } from '@/actions/hrd/mobile-dashboard';
import { MobileSectionHeader, MobileInsightCard } from '@/components/mobile';

export default async function HrdInsightsPage() {
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
            <MobileSectionHeader title="HRD Insights" />

            <div className="grid grid-cols-1 gap-3">
                <MobileInsightCard
                    insight={{
                        key: 'present-count',
                        label: 'Total Hadir Hari Ini',
                        value: highlights.presentTodayCount,
                        unit: 'karyawan',
                        severity: 'SUCCESS',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'pending-leave-approval',
                        label: 'Cuti Membutuhkan Approval',
                        value: highlights.pendingLeaveCount,
                        unit: 'pengajuan',
                        severity: highlights.pendingLeaveCount > 0 ? 'WARNING' : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'payroll-period-active',
                        label: 'Periode Penggajian Aktif',
                        value: highlights.openPayrollPeriodName ?? 'Belum Dibuka',
                        severity: highlights.openPayrollPeriodName ? 'SUCCESS' : 'INFO',
                    }}
                />
            </div>
        </div>
    );
}
