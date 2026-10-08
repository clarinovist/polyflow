import React from 'react';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { getHrdMobileOverview } from '@/actions/hrd/mobile-dashboard';
import {
    MobileDataFreshness,
    MobileSectionHeader,
    MobileInsightCard,
} from '@/components/mobile';

export default async function HrdInsightsPage() {
    const response = await getHrdMobileOverview();
    if (!response.success)
        return <MobileReadError title="Insight HRD belum tersedia" />;
    const { highlights, generatedAt, payrollReadiness, alerts } = response.data;

    return (
        <div className="space-y-6">
            <MobileSectionHeader title="HRD Insights" level={1} />
            <MobileDataFreshness generatedAt={generatedAt} />

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
                        severity:
                            highlights.pendingLeaveCount > 0
                                ? 'WARNING'
                                : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'payroll-period-active',
                        label: 'Periode Penggajian Aktif',
                        value:
                            highlights.openPayrollPeriodName ?? 'Belum Dibuka',
                        severity: highlights.openPayrollPeriodName
                            ? 'SUCCESS'
                            : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'employment-reminder-count',
                        label: 'Kontrak/Probation ≤30 Hari',
                        value: highlights.employmentReminderCount,
                        severity:
                            highlights.employmentReminderCount > 0
                                ? 'WARNING'
                                : 'INFO',
                    }}
                />
            </div>
            <section
                aria-labelledby="hr-alert-heading"
                className="space-y-3 rounded-xl border bg-card p-4"
            >
                <h2 id="hr-alert-heading" className="font-semibold">
                    Alert HR aktif
                </h2>
                {!alerts.length ? (
                    <p className="text-sm text-muted-foreground">
                        Tidak ada alert kontrak/probation belum dibaca.
                    </p>
                ) : (
                    alerts.map((alert) => (
                        <article
                            key={alert.id}
                            className="border-t pt-3 first:border-t-0 first:pt-0"
                        >
                            <h3 className="text-sm font-semibold">
                                {alert.title}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                {alert.type.replaceAll('_', ' ')} ·{' '}
                                {new Date(alert.createdAt).toLocaleDateString(
                                    'id-ID',
                                )}
                            </p>
                        </article>
                    ))
                )}
                <p className="text-xs text-muted-foreground">
                    {payrollReadiness
                        ? `${payrollReadiness.counts.draft} draft payroll masih perlu review.`
                        : 'Tidak ada payroll terbuka.'}
                </p>
            </section>
        </div>
    );
}
