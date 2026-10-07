import React from 'react';
import Link from 'next/link';
import { Wrench } from 'lucide-react';
import { auth } from '@/auth';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import {
    getProductionSupervisorOverview,
    getFactoryManagerExecutiveOverview,
} from '@/actions/production/mobile-supervisor';
import { getProductionAlertThresholdsForPage } from '@/actions/production/alert-threshold-settings';
import {
    DEFAULT_PRODUCTION_ALERT_THRESHOLDS,
    isDowntimeCritical,
} from '@/lib/production/alert-thresholds';
import { isMobileSupervisorOperator } from '@/lib/mobile/mobile-access-policy';
import { MobileInsightCard, MobileSectionHeader } from '@/components/mobile';

export default async function ProductionMobilePage() {
    const session = await auth();
    const user = session?.user as
        | { role?: string; roles?: string[]; isSuperAdmin?: boolean }
        | undefined;
    const canOperate = isMobileSupervisorOperator(user);

    const [overviewRes, thresholdsRes, execRes] = await Promise.all([
        getProductionSupervisorOverview(),
        getProductionAlertThresholdsForPage(),
        canOperate
            ? Promise.resolve(null)
            : getFactoryManagerExecutiveOverview(),
    ]);
    if (!overviewRes.success) return <MobileReadError title="Ringkasan produksi belum tersedia" />;
    const overview = overviewRes.data;
    const thresholds = thresholdsRes.success
        ? thresholdsRes.data
        : { ...DEFAULT_PRODUCTION_ALERT_THRESHOLDS };
    const exec = execRes && execRes.success ? execRes.data : null;

    const { highlights } = overview;
    const targetLabel =
        highlights.targetToday == null
            ? null
            : highlights.targetUnitMode === 'MIXED'
              ? `${highlights.targetToday} (campuran)`
              : `${highlights.targetToday}${highlights.targetUnit ? ' ' + highlights.targetUnit : ''}`;

    return (
        <div className="space-y-6">
            <Link
                href="/production/mobile/maintenance"
                className="flex min-h-11 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200"
            >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white">
                    <Wrench aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">Maintenance mesin</span>
                    <span className="block text-xs text-emerald-700 dark:text-emerald-300">
                        Lapor gangguan atau buka antrean pekerjaan
                    </span>
                </span>
                <span aria-hidden="true">→</span>
            </Link>

            <div className="flex gap-2">
                {canOperate && (
                    <a
                        href="/production/mobile/tasks/new"
                        className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-indigo-600 px-3 py-2.5 text-center text-sm font-bold text-white"
                    >
                        + Buat SPK Mendadak
                    </a>
                )}
                <a
                    href="/production/mobile/attendance"
                    className="flex min-h-11 flex-1 items-center justify-center rounded-lg border bg-white px-3 py-2.5 text-center text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
                >
                    Lihat Absensi Produksi
                </a>
            </div>

            <MobileSectionHeader title="Pulse Shift Hari Ini" level={1} />

            <div className="grid grid-cols-2 gap-3">
                <MobileInsightCard
                    insight={{
                        key: 'active-spk',
                        label: 'SPK Aktif',
                        value: highlights.activeOrdersCount,
                        severity:
                            highlights.activeOrdersCount > 0
                                ? 'SUCCESS'
                                : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'output-today',
                        label: 'Output Hari Ini',
                        value: highlights.outputToday,
                        unit: 'unit',
                        severity: 'SUCCESS',
                    }}
                />
                {targetLabel && (
                    <MobileInsightCard
                        insight={{
                            key: 'target-today',
                            label: 'Target Hari Ini',
                            value: targetLabel,
                            severity: 'INFO',
                        }}
                    />
                )}
                <MobileInsightCard
                    insight={{
                        key: 'downtime-total',
                        label: 'Downtime Total',
                        value: highlights.downtimeMinutesToday,
                        unit: 'menit',
                        severity: isDowntimeCritical(
                            thresholds,
                            highlights.downtimeMinutesToday,
                        )
                            ? 'CRITICAL'
                            : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'qc-pending',
                        label: 'QC Pending',
                        value: highlights.qcPendingCount,
                        unit: 'item',
                        severity:
                            highlights.qcPendingCount > 0
                                ? 'WARNING'
                                : 'SUCCESS',
                    }}
                />
            </div>

            {exec && (
                <>
                    <MobileSectionHeader title="Perlu Perhatian" />
                    <div className="grid grid-cols-2 gap-3">
                        <MobileInsightCard
                            insight={{
                                key: 'low-stock',
                                label: 'Stok Kritis',
                                value: exec.stock.lowStockCount,
                                unit: 'varian',
                                severity:
                                    exec.stock.lowStockCount > 0
                                        ? 'WARNING'
                                        : 'SUCCESS',
                            }}
                        />
                        <MobileInsightCard
                            insight={{
                                key: 'suggested-reorder',
                                label: 'Perlu Reorder',
                                value: exec.stock.suggestedReorderCount,
                                unit: 'varian',
                                severity:
                                    exec.stock.suggestedReorderCount > 0
                                        ? 'WARNING'
                                        : 'SUCCESS',
                            }}
                        />
                        <MobileInsightCard
                            insight={{
                                key: 'open-pr',
                                label: 'PR Terbuka',
                                value: exec.purchasing.openPrCount,
                                unit: 'dokumen',
                                severity:
                                    exec.purchasing.openPrCount > 0
                                        ? 'INFO'
                                        : 'SUCCESS',
                            }}
                        />
                        <MobileInsightCard
                            insight={{
                                key: 'waiting-receipt',
                                label: 'PO Menunggu Terima',
                                value: exec.purchasing.waitingReceiptCount,
                                unit: 'dokumen',
                                severity:
                                    exec.purchasing.waitingReceiptCount > 0
                                        ? 'INFO'
                                        : 'SUCCESS',
                            }}
                        />
                    </div>

                    <MobileSectionHeader title="Kondisi Tim" />
                    <div className="grid grid-cols-2 gap-3">
                        <MobileInsightCard
                            insight={{
                                key: 'team-present',
                                label: 'Hadir',
                                value: exec.team.presentCount,
                                unit: 'orang',
                                severity: 'SUCCESS',
                            }}
                        />
                        <MobileInsightCard
                            insight={{
                                key: 'team-absent',
                                label: 'Absen',
                                value: exec.team.absentCount,
                                unit: 'orang',
                                severity:
                                    exec.team.absentCount > 0
                                        ? 'WARNING'
                                        : 'SUCCESS',
                            }}
                        />
                        <MobileInsightCard
                            insight={{
                                key: 'team-on-leave',
                                label: 'Cuti',
                                value: exec.team.onLeaveCount,
                                unit: 'orang',
                                severity: 'INFO',
                            }}
                        />
                        <MobileInsightCard
                            insight={{
                                key: 'team-no-record',
                                label: 'Tanpa Catatan',
                                value: exec.team.noRecordCount,
                                unit: 'orang',
                                severity:
                                    exec.team.noRecordCount > 0
                                        ? 'WARNING'
                                        : 'SUCCESS',
                            }}
                        />
                    </div>
                </>
            )}

            <div>
                <MobileSectionHeader title="Downtime Mesin Terakhir" />
                {!overview || overview.downtimeAlerts.length === 0 ? (
                    <p className="text-sm text-slate-500 py-3">
                        Tidak ada catatan downtime mesin hari ini.
                    </p>
                ) : (
                    <div className="space-y-2 mt-2">
                        {overview.downtimeAlerts.map((dt) => (
                            <div
                                key={dt.id}
                                className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex justify-between items-center"
                            >
                                <div>
                                    <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                                        {dt.machineName}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        {dt.reason}
                                    </div>
                                </div>
                                <span className="text-xs font-semibold px-2 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 rounded">
                                    {dt.durationMinutes} min
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
