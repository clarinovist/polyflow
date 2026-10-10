import React from 'react';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { getProductionSupervisorOverview } from '@/actions/production/mobile-supervisor';
import {
    MobileDataFreshness,
    MobileSectionHeader,
    MobileInsightCard,
} from '@/components/mobile';

const PROCESS_LABEL: Record<string, string> = {
    MIXING: 'Mixing',
    EXTRUSION: 'Extrusion',
    PACKING: 'Packing',
    OTHER: 'Proses lain',
};

function Withheld({ children }: { children: React.ReactNode }) {
    return (
        <p className="rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {children}
        </p>
    );
}

export default async function ProductionInsightsPage() {
    const response = await getProductionSupervisorOverview();
    if (!response.success) {
        return <MobileReadError title="Insight produksi belum tersedia" />;
    }
    const overview = response.data;

    return (
        <div className="space-y-6">
            <MobileSectionHeader title="Insight Produksi" level={1} />
            <MobileDataFreshness generatedAt={overview.generatedAt} />

            <section className="space-y-3">
                <MobileSectionHeader title="Output Hari Ini per Proses & Satuan" />
                {overview.health.outputToday.status === 'AVAILABLE' ? (
                    overview.health.outputToday.data.processTotals.length >
                    0 ? (
                        <div className="grid grid-cols-1 gap-3">
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
                        <p className="text-sm text-slate-500">
                            Belum ada output non-voided dalam hari bisnis WIB
                            ini.
                        </p>
                    )
                ) : (
                    <p role="status" className="text-sm text-amber-700">
                        Output hari ini tidak tersedia; nilai tidak diganti
                        dengan nol.
                    </p>
                )}
            </section>

            <section className="space-y-3">
                <MobileSectionHeader title="Fakta Operasional" />
                {overview.health.qcPending.status === 'AVAILABLE' ? (
                    <MobileInsightCard
                        insight={{
                            key: 'qc-queue',
                            label: 'QC Pending',
                            value: overview.health.qcPending.data.count,
                            unit: 'item',
                            severity: 'INFO',
                        }}
                    />
                ) : (
                    <p role="status" className="text-sm text-amber-700">
                        Antrean QC tidak tersedia.
                    </p>
                )}
                {overview.health.downtime.status === 'AVAILABLE' ? (
                    <>
                        <MobileInsightCard
                            insight={{
                                key: 'downtime-duration',
                                label: 'Total Durasi Downtime Hari Ini',
                                value: overview.health.downtime.data
                                    .totalMinutesToday,
                                unit: 'menit',
                                severity: 'INFO',
                            }}
                        />
                        <p className="text-xs text-slate-500">
                            Total harian tidak diberi severity. Ambang tenant
                            hanya menilai insiden terbuka terlama.
                        </p>
                    </>
                ) : (
                    <p role="status" className="text-sm text-amber-700">
                        Downtime atau sumber ambang tenant tidak tersedia.
                    </p>
                )}
            </section>

            <section className="space-y-3">
                <MobileSectionHeader title="Belum Dikonfigurasi" />
                <Withheld>
                    Target produksi, attainment, dan efisiensi output ditahan
                    sampai definisi owner dan cohort yang comparable tersedia.
                </Withheld>
                <Withheld>
                    Scrap rate dan severity quantity ditahan karena agregasi
                    lintas proses/satuan belum mempunyai denominator yang sah.
                </Withheld>
            </section>
        </div>
    );
}
