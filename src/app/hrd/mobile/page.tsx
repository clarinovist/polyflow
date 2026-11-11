import React from 'react';
import { getHrdMobileHealth } from '@/actions/hrd/mobile-dashboard';
import { DashboardSectionState } from '@/components/dashboard/DashboardMetricPrimitives';
import {
    HrdAttendanceCards,
    HrdFollowUpCard,
} from '@/components/hrd/mobile/HealthCards';
import { HrdReadError } from '@/components/hrd/mobile/HrdReadError';
import {
    MobileDataFreshness,
    MobileInsightCard,
    MobileSectionHeader,
} from '@/components/mobile';
import type { HrdDashboardAggregate } from '@/services/hrd/hrd-dashboard-service';

export default async function HrdMobilePage() {
    const response = await getHrdMobileHealth();
    if (!response.success)
        return (
            <HrdReadError
                title="Ringkasan HRD belum tersedia"
                message={response.error}
            />
        );

    const { generatedAt, workDate, health } = response.data;

    return (
        <div className="space-y-6">
            <MobileSectionHeader title="Ringkasan HRD Hari Ini" level={1} />
            <MobileDataFreshness generatedAt={generatedAt} />

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
            <HrdAttendanceCards
                attendance={health.attendanceToday}
                workDate={workDate}
            />
            <HrdFollowUpCard followUp={health.employmentFollowUp} />
            <PayrollReadinessSection readiness={health.payrollReadiness} />
        </div>
    );
}

function PayrollReadinessSection({
    readiness,
}: {
    readiness: HrdDashboardAggregate['health']['payrollReadiness'];
}) {
    return (
        <section
            aria-labelledby="hrd-payroll-readiness"
            className="rounded-xl border bg-card p-4"
        >
            <h2 id="hrd-payroll-readiness" className="font-semibold">
                Review payroll agregat
            </h2>
            {readiness.status === 'AVAILABLE' ? (
                <>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {readiness.data.finalized + readiness.data.paid}/
                        {readiness.data.total} slip selesai review ·{' '}
                        {readiness.data.draft} draf
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                        Periode terbuka terbaru {readiness.data.month}/
                        {readiness.data.year}; hanya slip yang sudah dibuat,
                        bukan kelengkapan seluruh karyawan.
                    </p>
                </>
            ) : (
                <DashboardSectionState
                    state={readiness.status}
                    title={
                        readiness.status === 'NOT_CONFIGURED'
                            ? 'Belum ada periode payroll terbuka'
                            : 'Status payroll tidak tersedia'
                    }
                    description={
                        readiness.status === 'NOT_CONFIGURED'
                            ? 'Buka periode payroll sebelum status slip dapat ditampilkan.'
                            : 'Gagal memuat bukan berarti nol.'
                    }
                />
            )}
            <p className="mt-2 text-xs text-muted-foreground">
                Agregat tanpa nama, rekening, atau nominal individual.
            </p>
        </section>
    );
}
