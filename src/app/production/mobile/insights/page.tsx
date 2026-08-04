import React from 'react';
import { getProductionSupervisorOverview } from '@/actions/production/mobile-supervisor';
import { getProductionAlertThresholdsForPage } from '@/actions/production/alert-threshold-settings';
import {
    DEFAULT_PRODUCTION_ALERT_THRESHOLDS,
    isDowntimeCritical,
    isScrapQuantityCritical,
} from '@/lib/production/alert-thresholds';
import { MobileSectionHeader, MobileInsightCard } from '@/components/mobile';

export default async function ProductionInsightsPage() {
    const [overviewRes, thresholdsRes] = await Promise.all([
        getProductionSupervisorOverview(),
        getProductionAlertThresholdsForPage(),
    ]);
    const overview = overviewRes.success ? overviewRes.data : null;
    const thresholds = thresholdsRes.success
        ? thresholdsRes.data
        : { ...DEFAULT_PRODUCTION_ALERT_THRESHOLDS };

    const highlights = overview?.highlights ?? {
        activeOrdersCount: 0,
        outputToday: 0,
        targetToday: null,
        targetUnitMode: 'NONE' as const,
        targetUnit: null,
        downtimeMinutesToday: 0,
        scrapToday: 0,
        qcPendingCount: 0,
    };

    const target = highlights.targetToday;
    const efficiencyAvailable =
        target !== null && target > 0 && highlights.targetUnitMode !== 'MIXED';
    const efficiency =
        efficiencyAvailable && target !== null
            ? Math.round((highlights.outputToday / target) * 100)
            : null;

    return (
        <div className="space-y-6">
            <MobileSectionHeader title="Insight & KPI Produksi" />

            <div className="grid grid-cols-1 gap-3">
                <MobileInsightCard
                    insight={{
                        key: 'afval-scrap',
                        label: 'Total Scrapped (Afval)',
                        value: highlights.scrapToday,
                        unit: 'unit',
                        severity: isScrapQuantityCritical(
                            thresholds,
                            highlights.scrapToday,
                        )
                            ? 'CRITICAL'
                            : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'efficiency-target',
                        label: 'Efisiensi Output Target',
                        value: efficiency === null ? '—' : efficiency,
                        unit: efficiency === null ? undefined : '%',
                        severity: 'SUCCESS',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'qc-queue',
                        label: 'Status Antrean QC',
                        value: highlights.qcPendingCount,
                        unit: 'item',
                        severity: highlights.qcPendingCount > 0 ? 'WARNING' : 'SUCCESS',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'downtime-duration',
                        label: 'Total Durasi Downtime',
                        value: highlights.downtimeMinutesToday,
                        unit: 'menit',
                        severity: isDowntimeCritical(
                            thresholds,
                            highlights.downtimeMinutesToday,
                        )
                            ? 'CRITICAL'
                            : 'SUCCESS',
                    }}
                />
            </div>

            {!efficiencyAvailable && (
                <p className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2">
                    Efisiensi output tidak dapat dihitung:{' '}
                    {highlights.targetToday === null
                        ? 'target hari ini tidak tersedia.'
                        : 'rencana produksi hari ini memakai satuan yang berbeda-beda.'}
                </p>
            )}
        </div>
    );
}
