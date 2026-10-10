import React from 'react';
import Link from 'next/link';
import { Wrench } from 'lucide-react';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import {
    getFactoryManagerExecutiveOverview,
    getProductionSupervisorOverview,
    type FactoryManagerExecutiveOverview,
} from '@/actions/production/mobile-supervisor';
import {
    MobileDataFreshness,
    MobileInsightCard,
    MobileSectionHeader,
} from '@/components/mobile';
import type { ProductionMobileSection } from '@/services/production/production-mobile-dashboard-service';

const PROCESS_LABEL: Record<string, string> = {
    MIXING: 'Mixing',
    EXTRUSION: 'Extrusion',
    PACKING: 'Packing',
    OTHER: 'Proses lain',
};

function SectionUnavailable({ label }: { label: string }) {
    return (
        <div
            role="status"
            className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
        >
            {label} tidak tersedia. Nilai tidak diganti dengan nol.
        </div>
    );
}

function NotConfigured({ children }: { children: React.ReactNode }) {
    return (
        <p className="rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {children}
        </p>
    );
}

function renderCount(
    section: ProductionMobileSection<{ count: number }>,
    label: string,
    unit: string,
) {
    return section.status === 'AVAILABLE' ? (
        <MobileInsightCard
            insight={{
                key: label,
                label,
                value: section.data.count,
                unit,
                severity: 'INFO',
            }}
        />
    ) : (
        <SectionUnavailable label={label} />
    );
}

function ExecutiveSections({
    executive,
}: {
    executive: FactoryManagerExecutiveOverview;
}) {
    return (
        <>
            <MobileSectionHeader title="Perlu Perhatian" />
            {executive.stock.status === 'AVAILABLE' ? (
                <div className="grid grid-cols-2 gap-3">
                    <MobileInsightCard
                        insight={{
                            key: 'low-stock',
                            label: 'Stok Kritis',
                            value: executive.stock.data.lowStockCount,
                            unit: 'varian',
                            severity: 'INFO',
                        }}
                    />
                    <MobileInsightCard
                        insight={{
                            key: 'suggested-reorder',
                            label: 'Perlu Reorder',
                            value: executive.stock.data.suggestedReorderCount,
                            unit: 'varian',
                            severity: 'INFO',
                        }}
                    />
                </div>
            ) : (
                <SectionUnavailable label="Ringkasan stok" />
            )}
            {executive.purchasing.status === 'AVAILABLE' ? (
                <MobileInsightCard
                    insight={{
                        key: 'waiting-receipt',
                        label: 'PO Menunggu Terima',
                        value: executive.purchasing.data.waitingReceiptCount,
                        unit: 'dokumen',
                        severity: 'INFO',
                    }}
                />
            ) : (
                <SectionUnavailable label="Ringkasan penerimaan Purchasing" />
            )}

            <MobileSectionHeader title="Kondisi Tim" />
            {executive.workforce.status === 'AVAILABLE' ? (
                <div className="grid grid-cols-2 gap-3">
                    {[
                        [
                            'Karyawan Aktif',
                            executive.workforce.data.activeCount,
                        ],
                        [
                            'Hadir Tercatat',
                            executive.workforce.data.presentCount,
                        ],
                        [
                            'Absen Tercatat',
                            executive.workforce.data.absentCount,
                        ],
                        [
                            'Cuti Tercatat',
                            executive.workforce.data.onLeaveCount,
                        ],
                    ].map(([label, value]) =>
                        value === null ? (
                            <SectionUnavailable
                                key={label}
                                label={String(label)}
                            />
                        ) : (
                            <MobileInsightCard
                                key={label}
                                insight={{
                                    key: String(label),
                                    label: String(label),
                                    value: Number(value),
                                    unit: 'orang',
                                    severity: 'INFO',
                                }}
                            />
                        ),
                    )}
                </div>
            ) : (
                <SectionUnavailable label="Ringkasan tenaga kerja" />
            )}
        </>
    );
}

export default async function ProductionMobilePage() {
    const overviewRes = await getProductionSupervisorOverview();
    if (!overviewRes.success) {
        return <MobileReadError title="Ringkasan produksi belum tersedia" />;
    }
    const overview = overviewRes.data;
    const executiveRes =
        overview.audience === 'EXECUTIVE'
            ? await getFactoryManagerExecutiveOverview()
            : null;
    const executive = executiveRes?.success ? executiveRes.data : null;

    return (
        <div className="space-y-6">
            {overview.links.maintenance && (
                <Link
                    href={overview.links.maintenance}
                    className="flex min-h-11 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200"
                >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white">
                        <Wrench aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                            Maintenance mesin
                        </span>
                        <span className="block text-xs text-emerald-700 dark:text-emerald-300">
                            Lapor gangguan atau buka antrean pekerjaan
                        </span>
                    </span>
                    <span aria-hidden="true">→</span>
                </Link>
            )}

            <div className="flex gap-2">
                {overview.links.quickSpk && (
                    <Link
                        href={overview.links.quickSpk}
                        className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-indigo-600 px-3 py-2.5 text-center text-sm font-bold text-white"
                    >
                        + Buat SPK Mendadak
                    </Link>
                )}
                {overview.links.attendance && (
                    <Link
                        href={overview.links.attendance}
                        className="flex min-h-11 flex-1 items-center justify-center rounded-lg border bg-white px-3 py-2.5 text-center text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                        Lihat Absensi Produksi
                    </Link>
                )}
            </div>

            <MobileSectionHeader title="Pulse Shift Hari Ini" level={1} />
            <MobileDataFreshness generatedAt={overview.generatedAt} />

            <div className="grid grid-cols-2 gap-3">
                {renderCount(overview.health.activeSpk, 'SPK Aktif', 'SPK')}
                {renderCount(overview.health.qcPending, 'QC Pending', 'item')}
            </div>

            <section className="space-y-2">
                <MobileSectionHeader title="Output Hari Ini" />
                {overview.health.outputToday.status === 'AVAILABLE' ? (
                    overview.health.outputToday.data.processTotals.length >
                    0 ? (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {overview.health.outputToday.data.processTotals.map(
                                (total) => (
                                    <MobileInsightCard
                                        key={`${total.processKey}-${total.unit}`}
                                        insight={{
                                            key: `${total.processKey}-${total.unit}`,
                                            label:
                                                PROCESS_LABEL[
                                                    total.processKey
                                                ] ?? total.processKey,
                                            value: total.quantity,
                                            unit: total.unit,
                                            severity: 'INFO',
                                        }}
                                    />
                                ),
                            )}
                        </div>
                    ) : (
                        <p className="py-3 text-sm text-slate-500">
                            Belum ada output non-voided pada hari bisnis WIB
                            ini.
                        </p>
                    )
                ) : (
                    <SectionUnavailable label="Output hari ini" />
                )}
            </section>

            <section className="space-y-2">
                <MobileSectionHeader title="Downtime Mesin Terbuka" />
                {overview.health.downtime.status === 'AVAILABLE' ? (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <MobileInsightCard
                                insight={{
                                    key: 'open-downtime',
                                    label: 'Insiden Terbuka',
                                    value: overview.health.downtime.data
                                        .openCount,
                                    unit: 'insiden',
                                    severity: 'INFO',
                                }}
                            />
                            <MobileInsightCard
                                insight={{
                                    key: 'downtime-total',
                                    label: 'Total Durasi Hari Ini',
                                    value: overview.health.downtime.data
                                        .totalMinutesToday,
                                    unit: 'menit',
                                    severity: 'INFO',
                                }}
                            />
                        </div>
                        {overview.health.downtime.data.longest ? (
                            <div className="rounded-lg border bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                                <p className="text-sm font-semibold">
                                    Terlama: Mesin{' '}
                                    {
                                        overview.health.downtime.data.longest
                                            .machineCode
                                    }
                                </p>
                                <p className="text-xs text-slate-500">
                                    {
                                        overview.health.downtime.data.longest
                                            .reason
                                    }{' '}
                                    ·{' '}
                                    {
                                        overview.health.downtime.data.longest
                                            .minutes
                                    }{' '}
                                    menit · status{' '}
                                    {overview.health.downtime.data.longest
                                        .severity === 'red'
                                        ? 'kritis'
                                        : 'perhatian'}{' '}
                                    terhadap ambang insiden{' '}
                                    {
                                        overview.health.downtime.data
                                            .thresholdMinutes
                                    }{' '}
                                    menit
                                </p>
                            </div>
                        ) : (
                            <p className="py-3 text-sm text-slate-500">
                                Tidak ada insiden downtime yang masih terbuka.
                            </p>
                        )}
                        <p className="text-xs text-slate-500">
                            Total durasi harian adalah fakta operasional dan
                            tidak diklasifikasikan dengan ambang per-insiden.
                        </p>
                    </>
                ) : (
                    <SectionUnavailable label="Downtime dan ambang tenant" />
                )}
            </section>

            <section className="space-y-2">
                <MobileSectionHeader title="Metrik yang Ditahan" />
                <NotConfigured>
                    Target, attainment, dan efisiensi output belum
                    dikonfigurasi; tidak ada persentase atau target sintetis
                    yang ditampilkan.
                </NotConfigured>
                <NotConfigured>
                    Severity scrap rate/quantity belum dikonfigurasi karena
                    denominator dan satuan global belum ditandatangani owner.
                </NotConfigured>
            </section>

            {executive ? (
                <ExecutiveSections executive={executive} />
            ) : executiveRes && !executiveRes.success ? (
                <SectionUnavailable label="Ringkasan eksekutif Kepala Pabrik" />
            ) : null}
        </div>
    );
}
