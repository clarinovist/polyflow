import Link from 'next/link';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { getFinanceMobileOverview } from '@/actions/finance/mobile-dashboard';
import {
    MobileDataFreshness,
    MobileInsightCard,
    MobileSectionHeader,
} from '@/components/mobile';
import type { MobileSection } from '@/services/dashboard/mobile-section-state';
import {
    FinanceSectionNotice,
    financeCountSeverity,
    financeMetricValue,
} from './finance-mobile-view';

function fiscalPeriodLabel(
    section: MobileSection<{ period: string; status: string }>,
): string {
    if (section.status === 'AVAILABLE') return section.data.status;
    if (section.status === 'NOT_CONFIGURED') return 'Belum dibuat';
    return '—';
}

export default async function FinanceMobilePage() {
    const response = await getFinanceMobileOverview();
    if (!response.success)
        return <MobileReadError title="Ringkasan finance belum tersedia" />;
    const { highlights, generatedAt, readiness } = response.data;
    const sections = response.data.sections ?? {};
    const payroll = readiness.payroll;
    return (
        <div className="space-y-6">
            <MobileSectionHeader title="Finance Pulse Hari Ini" level={1} />
            <MobileDataFreshness generatedAt={generatedAt} />
            <FinanceSectionNotice sections={sections} />
            <div className="grid grid-cols-2 gap-3">
                <MobileInsightCard
                    insight={{
                        key: 'ar-count',
                        label: 'Piutang Terbuka',
                        value: financeMetricValue(highlights.arCount),
                        severity: financeCountSeverity(
                            highlights.arCount,
                            'WARNING',
                        ),
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'ap-count',
                        label: 'Hutang Terbuka',
                        value: financeMetricValue(highlights.apCount),
                        severity: financeCountSeverity(
                            highlights.apCount,
                            'CRITICAL',
                        ),
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'draft-journals',
                        label: 'Draft Jurnal',
                        value: financeMetricValue(highlights.draftJournalCount),
                        severity: financeCountSeverity(
                            highlights.draftJournalCount,
                            'WARNING',
                            'INFO',
                        ),
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'open-recon',
                        label: 'Rekonsiliasi Bank',
                        value: financeMetricValue(highlights.openReconCount),
                        severity: 'INFO',
                    }}
                />
            </div>
            <Link
                href="/finance/mobile/tasks"
                className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
            >
                Buka antrean AR/AP
            </Link>
            <section
                aria-labelledby="finance-readiness"
                className="space-y-3 rounded-xl border bg-card p-4"
            >
                <h2 id="finance-readiness" className="font-semibold">
                    Kesiapan periode
                </h2>
                <dl className="space-y-3 text-sm">
                    <div>
                        <dt className="text-muted-foreground">
                            Periode Finance bulan ini
                        </dt>
                        <dd className="font-semibold">
                            {fiscalPeriodLabel(readiness.fiscalPeriod)}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">
                            Payroll periode OPEN terakhir
                        </dt>
                        <dd className="font-semibold">
                            {payroll.status === 'AVAILABLE'
                                ? `${payroll.data.status} · ${payroll.data.counts.paid}/${payroll.data.total} paid`
                                : payroll.status === 'NOT_CONFIGURED'
                                  ? 'Belum ada periode OPEN'
                                  : '—'}
                        </dd>
                    </div>
                </dl>
                <p className="text-xs text-muted-foreground">
                    Ringkasan payroll hanya agregat status, tanpa nama atau
                    nominal personal.
                </p>
            </section>
        </div>
    );
}
