import React from 'react';
import Link from 'next/link';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { getFinanceMobileOverview } from '@/actions/finance/mobile-dashboard';
import {
    MobileDataFreshness,
    MobileInsightCard,
    MobileSectionHeader,
} from '@/components/mobile';

export default async function FinanceMobilePage() {
    const response = await getFinanceMobileOverview();
    if (!response.success)
        return <MobileReadError title="Ringkasan finance belum tersedia" />;
    const { highlights, generatedAt, readiness } = response.data;
    return (
        <div className="space-y-6">
            <MobileSectionHeader title="Finance Pulse Hari Ini" level={1} />
            <MobileDataFreshness generatedAt={generatedAt} />
            <div className="grid grid-cols-2 gap-3">
                <MobileInsightCard
                    insight={{
                        key: 'ar-count',
                        label: 'Piutang Terbuka',
                        value: highlights.arCount,
                        severity: highlights.arCount ? 'WARNING' : 'SUCCESS',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'ap-count',
                        label: 'Hutang Terbuka',
                        value: highlights.apCount,
                        severity: highlights.apCount ? 'CRITICAL' : 'SUCCESS',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'draft-journals',
                        label: 'Draft Jurnal',
                        value: highlights.draftJournalCount,
                        severity: highlights.draftJournalCount
                            ? 'WARNING'
                            : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'open-recon',
                        label: 'Rekonsiliasi Bank',
                        value: highlights.openReconCount,
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
                            {readiness.fiscalPeriod?.status ?? 'Belum dibuat'}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">
                            Payroll bulan ini
                        </dt>
                        <dd className="font-semibold">
                            {readiness.payroll
                                ? `${readiness.payroll.status} · ${readiness.payroll.counts.paid}/${readiness.payroll.total} paid`
                                : 'Belum dibuat'}
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
