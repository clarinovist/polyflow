import React from 'react';
import { getHrdMobileHealth } from '@/actions/hrd/mobile-dashboard';
import { DashboardSectionState } from '@/components/dashboard/DashboardMetricPrimitives';
import {
    HrdAttendanceCards,
    HrdFollowUpCard,
} from '@/components/hrd/mobile/HealthCards';
import { HrdReadError } from '@/components/hrd/mobile/HrdReadError';
import { MobileDataFreshness, MobileSectionHeader } from '@/components/mobile';

export default async function HrdInsightsPage() {
    const response = await getHrdMobileHealth();
    if (!response.success)
        return (
            <HrdReadError
                title="Wawasan HRD belum tersedia"
                message={response.error}
            />
        );

    const { generatedAt, workDate, health, drivers } = response.data;

    return (
        <div className="space-y-6">
            <MobileSectionHeader title="Wawasan HRD" level={1} />
            <MobileDataFreshness generatedAt={generatedAt} />

            <HrdAttendanceCards
                attendance={health.attendanceToday}
                workDate={workDate}
            />
            <HrdFollowUpCard followUp={health.employmentFollowUp} />

            <section
                aria-labelledby="hrd-mobile-drivers"
                className="space-y-3 rounded-xl border bg-card p-4"
            >
                <h2 id="hrd-mobile-drivers" className="font-semibold">
                    Faktor Penyebab
                </h2>
                <DashboardSectionState
                    state={
                        drivers.status === 'NOT_CONFIGURED'
                            ? 'NOT_CONFIGURED'
                            : 'UNAVAILABLE'
                    }
                    title="Faktor per unit/shift belum dikonfigurasi"
                    description="Peringkat penyebab menunggu kontrak organisasi dan penjadwalan yang disetujui; hitungan mentah tidak diperlakukan sebagai sebab."
                />
                <p className="text-xs text-muted-foreground">
                    Tingkat kehadiran, perputaran karyawan, tren lembur, dan
                    produktivitas ditahan sampai definisinya disetujui.
                </p>
            </section>
        </div>
    );
}
