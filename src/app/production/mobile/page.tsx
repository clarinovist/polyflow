import React from 'react';
import { getProductionSupervisorOverview } from '@/actions/production/mobile-supervisor';
import { MobileInsightCard, MobileSectionHeader } from '@/components/mobile';

export default async function ProductionMobilePage() {
    const response = await getProductionSupervisorOverview();
    const overview = response.success ? response.data : null;

    const highlights = overview?.highlights ?? {
        activeOrdersCount: 0,
        outputToday: 0,
        targetToday: 1000,
        downtimeMinutesToday: 0,
        scrapToday: 0,
        qcPendingCount: 0,
    };

    return (
        <div className="space-y-6">
            <MobileSectionHeader title="Pulse Shift Hari Ini" />

            <div className="grid grid-cols-2 gap-3">
                <MobileInsightCard
                    insight={{
                        key: 'active-spk',
                        label: 'SPK Aktif',
                        value: highlights.activeOrdersCount,
                        severity: highlights.activeOrdersCount > 0 ? 'SUCCESS' : 'INFO',
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
                <MobileInsightCard
                    insight={{
                        key: 'downtime-total',
                        label: 'Downtime Total',
                        value: highlights.downtimeMinutesToday,
                        unit: 'menit',
                        severity: highlights.downtimeMinutesToday > 30 ? 'CRITICAL' : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'qc-pending',
                        label: 'QC Pending',
                        value: highlights.qcPendingCount,
                        unit: 'item',
                        severity: highlights.qcPendingCount > 0 ? 'WARNING' : 'SUCCESS',
                    }}
                />
            </div>

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
