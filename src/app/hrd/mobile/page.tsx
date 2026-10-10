import React from 'react';
import { getHrdMobileOverview } from '@/actions/hrd/mobile-dashboard';
import { DashboardSectionState } from '@/components/dashboard/DashboardMetricPrimitives';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import {
    MobileDataFreshness,
    MobileInsightCard,
    MobileSectionHeader,
} from '@/components/mobile';

export default async function HrdMobilePage() {
    const response = await getHrdMobileOverview();
    if (!response.success)
        return <MobileReadError title="Ringkasan HRD belum tersedia" />;

    const { generatedAt, workDate, health } = response.data;
    const attendance = health.attendanceToday;
    const followUp = health.employmentFollowUp;

    return (
        <div className="space-y-6">
            <MobileSectionHeader title="HRD Pulse Hari Ini" level={1} />
            <MobileDataFreshness generatedAt={generatedAt} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {health.activeHeadcount.status === 'AVAILABLE' ? (
                    <MobileInsightCard
                        insight={{
                            key: 'active-headcount',
                            label: 'Karyawan Aktif',
                            value: health.activeHeadcount.data.count,
                            unit: 'karyawan',
                            severity: 'INFO',
                        }}
                    />
                ) : (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Karyawan aktif tidak tersedia"
                    />
                )}
                {attendance.status === 'AVAILABLE' ? (
                    <MobileInsightCard
                        insight={{
                            key: 'present-today',
                            label: 'PRESENT Tercatat Hari Ini',
                            value: attendance.data.present,
                            unit: 'karyawan unik',
                            severity: 'INFO',
                            href: '/hrd/mobile/attendance',
                            actionLabel: 'Detail',
                        }}
                    />
                ) : (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Absensi tercatat tidak tersedia"
                        description="Kegagalan baca tidak dianggap nol."
                    />
                )}
                {attendance.status === 'AVAILABLE' ? (
                    <MobileInsightCard
                        insight={{
                            key: 'recorded-breakdown',
                            label: `ABSENT / ON_LEAVE · ${workDate}`,
                            value: `${attendance.data.absent} / ${attendance.data.onLeave}`,
                            unit: 'karyawan unik',
                            severity:
                                attendance.data.absent > 0 ? 'WARNING' : 'INFO',
                        }}
                    />
                ) : null}
                {attendance.status === 'AVAILABLE' ? (
                    <MobileInsightCard
                        insight={{
                            key: 'overtime-today',
                            label: 'Lembur pada Record PRESENT',
                            value: attendance.data.overtimeHours.toLocaleString(
                                'id-ID',
                                { maximumFractionDigits: 2 },
                            ),
                            unit: 'jam hari ini',
                            severity: 'INFO',
                        }}
                    />
                ) : null}
                {followUp.status === 'AVAILABLE' ? (
                    <MobileInsightCard
                        insight={{
                            key: 'employment-follow-up',
                            label: 'Kontrak/Probation ≤30 Hari',
                            value: followUp.data.total,
                            unit: 'karyawan',
                            severity:
                                followUp.data.total > 0 ? 'WARNING' : 'INFO',
                        }}
                    />
                ) : (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Tindak lanjut kepegawaian tidak tersedia"
                    />
                )}
            </div>

            <section
                aria-labelledby="hrd-payroll-readiness"
                className="rounded-xl border bg-card p-4"
            >
                <h2 id="hrd-payroll-readiness" className="font-semibold">
                    Review payroll agregat
                </h2>
                {health.payrollReadiness.status === 'AVAILABLE' ? (
                    <>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {health.payrollReadiness.data.finalized +
                                health.payrollReadiness.data.paid}
                            /{health.payrollReadiness.data.total} slip selesai
                            review · {health.payrollReadiness.data.draft} draft
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                            Periode OPEN terbaru{' '}
                            {health.payrollReadiness.data.month}/
                            {health.payrollReadiness.data.year}; hanya slip yang
                            sudah dibuat, bukan kelengkapan seluruh karyawan.
                        </p>
                    </>
                ) : (
                    <DashboardSectionState
                        state={health.payrollReadiness.status}
                        title={
                            health.payrollReadiness.status === 'NOT_CONFIGURED'
                                ? 'Belum ada periode payroll OPEN'
                                : 'Status payroll tidak tersedia'
                        }
                        description={
                            health.payrollReadiness.status === 'NOT_CONFIGURED'
                                ? 'Buka periode payroll sebelum status slip dapat ditampilkan.'
                                : 'Kegagalan baca tidak dianggap nol.'
                        }
                    />
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                    Agregat tanpa nama, rekening, atau nominal individual.
                </p>
            </section>
        </div>
    );
}
