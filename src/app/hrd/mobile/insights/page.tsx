import React from 'react';
import { getHrdMobileOverview } from '@/actions/hrd/mobile-dashboard';
import { DashboardSectionState } from '@/components/dashboard/DashboardMetricPrimitives';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import {
    MobileDataFreshness,
    MobileInsightCard,
    MobileSectionHeader,
} from '@/components/mobile';

export default async function HrdInsightsPage() {
    const response = await getHrdMobileOverview();
    if (!response.success)
        return <MobileReadError title="Insight HRD belum tersedia" />;

    const { generatedAt, workDate, health, drivers } = response.data;
    const attendance = health.attendanceToday;

    return (
        <div className="space-y-6">
            <MobileSectionHeader title="HRD Insights" level={1} />
            <MobileDataFreshness generatedAt={generatedAt} />

            <div className="grid grid-cols-1 gap-3">
                {attendance.status === 'AVAILABLE' ? (
                    <>
                        <MobileInsightCard
                            insight={{
                                key: 'recorded-statuses',
                                label: `Status Tercatat · ${workDate}`,
                                value: `${attendance.data.present} / ${attendance.data.absent} / ${attendance.data.onLeave}`,
                                unit: 'PRESENT / ABSENT / ON_LEAVE',
                                severity:
                                    attendance.data.absent > 0
                                        ? 'WARNING'
                                        : 'INFO',
                            }}
                        />
                        <MobileInsightCard
                            insight={{
                                key: 'overtime-hours',
                                label: 'Lembur Hari Ini pada Record PRESENT',
                                value: attendance.data.overtimeHours.toLocaleString(
                                    'id-ID',
                                    { maximumFractionDigits: 2 },
                                ),
                                unit: 'jam',
                                severity: 'INFO',
                            }}
                        />
                    </>
                ) : (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Status kehadiran tidak tersedia"
                        description="Kegagalan baca tidak dianggap nol dan tidak membuat NO_RECORD."
                    />
                )}
                {health.employmentFollowUp.status === 'AVAILABLE' ? (
                    <MobileInsightCard
                        insight={{
                            key: 'employment-follow-up',
                            label: 'Tindak Lanjut ≤30 Hari',
                            value: health.employmentFollowUp.data.total,
                            unit: `${health.employmentFollowUp.data.probation} probation · ${health.employmentFollowUp.data.contract} kontrak`,
                            severity:
                                health.employmentFollowUp.data.total > 0
                                    ? 'WARNING'
                                    : 'INFO',
                        }}
                    />
                ) : (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Tindak lanjut kontrak/probation tidak tersedia"
                    />
                )}
            </div>

            <section
                aria-labelledby="hrd-mobile-drivers"
                className="space-y-3 rounded-xl border bg-card p-4"
            >
                <h2 id="hrd-mobile-drivers" className="font-semibold">
                    Drivers
                </h2>
                <DashboardSectionState
                    state={
                        drivers.status === 'NOT_CONFIGURED'
                            ? 'NOT_CONFIGURED'
                            : 'UNAVAILABLE'
                    }
                    title="Driver unit/sif belum dikonfigurasi"
                    description="Ranking penyebab menunggu kontrak organisasi dan penjadwalan yang disetujui; hitungan mentah tidak diperlakukan sebagai sebab."
                />
                <p className="text-xs text-muted-foreground">
                    Attendance rate, NO_RECORD, turnover, tren lembur, dan
                    produktivitas ditahan sampai definisinya disetujui.
                </p>
            </section>
        </div>
    );
}
