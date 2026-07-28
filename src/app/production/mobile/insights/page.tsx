import React from 'react';
import { getProductionSupervisorOverview } from '@/actions/production/mobile-supervisor';
import { MobileSectionHeader, MobileInsightCard } from '@/components/mobile';

export default async function ProductionInsightsPage() {
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
            <MobileSectionHeader title="Insight & KPI Produksi" />

            <div className="grid grid-cols-1 gap-3">
                <MobileInsightCard
                    insight={{
                        key: 'afval-scrap',
                        label: 'Total Scrapped (Afval)',
                        value: highlights.scrapToday,
                        unit: 'kg',
                        severity: highlights.scrapToday > 50 ? 'CRITICAL' : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'efficiency-target',
                        label: 'Efisiensi Output Target',
                        value:
                            highlights.targetToday > 0
                                ? Math.round(
                                      (highlights.outputToday / highlights.targetToday) * 100,
                                  )
                                : 0,
                        unit: '%',
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
                        severity:
                            highlights.downtimeMinutesToday > 30 ? 'CRITICAL' : 'SUCCESS',
                    }}
                />
            </div>
        </div>
    );
}
