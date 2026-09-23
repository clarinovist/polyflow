import React from 'react';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { getHrdMobileOverview } from '@/actions/hrd/mobile-dashboard';
import { MobileInsightCard, MobileSectionHeader } from '@/components/mobile';

export default async function HrdMobilePage() {
    const response = await getHrdMobileOverview();
    if (!response.success) return <MobileReadError title="Ringkasan HRD belum tersedia" />;
    const { highlights } = response.data;

    return (
        <div className="space-y-6">
            <MobileSectionHeader title="HRD Pulse Hari Ini" level={1} />

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
