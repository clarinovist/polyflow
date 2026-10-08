import React from 'react';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { getHrdMobileOverview } from '@/actions/hrd/mobile-dashboard';
import {
    MobileDataFreshness,
    MobileInsightCard,
    MobileSectionHeader,
} from '@/components/mobile';

export default async function HrdMobilePage() {
    const response = await getHrdMobileOverview();
    if (!response.success)
        return <MobileReadError title="Ringkasan HRD belum tersedia" />;
    const { highlights, generatedAt, payrollReadiness } = response.data;

    return (
        <div className="space-y-6">
            <MobileSectionHeader title="HRD Pulse Hari Ini" level={1} />
            <MobileDataFreshness generatedAt={generatedAt} />

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
                        severity:
                            highlights.pendingLeaveCount > 0
                                ? 'WARNING'
                                : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'employment-reminders',
                        label: 'Kontrak/Probation',
                        value: highlights.employmentReminderCount,
                        unit: 'reminder',
                        severity:
                            highlights.employmentReminderCount > 0
                                ? 'WARNING'
                                : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'payroll-period',
                        label: 'Payroll Period',
                        value:
                            highlights.openPayrollPeriodName ?? 'Belum Dibuka',
                        severity: highlights.openPayrollPeriodName
                            ? 'SUCCESS'
                            : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'hr-alerts',
                        label: 'Alert HR Belum Dibaca',
                        value: highlights.hrAlertCount,
                        severity:
                            highlights.hrAlertCount > 0 ? 'WARNING' : 'INFO',
                    }}
                />
            </div>
            <section
                aria-labelledby="hrd-payroll-readiness"
                className="rounded-xl border bg-card p-4"
            >
                <h2 id="hrd-payroll-readiness" className="font-semibold">
                    Kesiapan payroll agregat
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    {payrollReadiness
                        ? `${payrollReadiness.counts.finalized + payrollReadiness.counts.paid}/${payrollReadiness.total} slip selesai review · ${payrollReadiness.counts.draft} draft`
                        : 'Belum ada periode payroll terbuka.'}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                    Tanpa nama, rekening, atau nominal individual.
                </p>
            </section>
        </div>
    );
}
