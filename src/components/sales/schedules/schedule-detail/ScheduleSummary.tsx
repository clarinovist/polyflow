import { ClipboardList, Gauge, PackageCheck, Truck } from 'lucide-react';
import { WorkflowSummaryGrid } from '@/components/workflow-detail/WorkflowSummaryGrid';
import type { Stop, Trip } from './types';

interface ScheduleSummaryProps {
    allStops: Stop[];
    totalPlannedKg: number;
    unlinkedCount: number;
    trips: Trip[];
}

export function ScheduleSummary({
    allStops,
    totalPlannedKg,
    unlinkedCount,
    trips,
}: ScheduleSummaryProps) {
    const missingWeightCount = allStops.filter(
        (stop) => stop.plannedWeightKg == null,
    ).length;
    const hasWeight = allStops.some((stop) => stop.plannedWeightKg != null);
    const missingAssignmentCount = trips.filter(
        (trip) =>
            !trip.vehicle &&
            !trip.externalPlate &&
            !trip.externalProvider,
    ).length;

    return (
        <div className="space-y-3">
            <WorkflowSummaryGrid
                label="Ringkasan jadwal kirim"
                items={[
                    {
                        label: 'Rencana Terjadwal',
                        icon: <ClipboardList className="h-4 w-4" />,
                        value: allStops.length,
                        detail:
                            allStops.length > 0
                                ? 'Stop pengiriman dalam minggu ini'
                                : 'Belum ada SO yang dijadwalkan',
                    },
                    {
                        label: 'Berat Rencana',
                        icon: <Gauge className="h-4 w-4" />,
                        value:
                            allStops.length > 0 && !hasWeight
                                ? 'Belum diisi'
                                : totalPlannedKg.toLocaleString('id-ID') +
                                  ' kg',
                        detail:
                            missingWeightCount > 0
                                ? missingWeightCount +
                                  ' rencana belum memiliki berat'
                                : 'Semua berat tersedia',
                    },
                    {
                        label: 'Tanpa Surat Jalan',
                        icon: <PackageCheck className="h-4 w-4" />,
                        value: unlinkedCount,
                        detail:
                            unlinkedCount > 0
                                ? 'Perlu generate Surat Jalan'
                                : 'Semua rencana sudah terhubung',
                    },
                    {
                        label: 'Trip & Armada',
                        icon: <Truck className="h-4 w-4" />,
                        value: trips.length + ' trip',
                        detail:
                            missingAssignmentCount > 0
                                ? missingAssignmentCount +
                                  ' trip tanpa penugasan armada'
                                : 'Semua trip memiliki penugasan armada',
                    },
                ]}
            />

            {(unlinkedCount > 0 ||
                missingWeightCount > 0 ||
                missingAssignmentCount > 0) && (
                <div
                    role="status"
                    className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
                >
                    <strong>Perlu perhatian:</strong>{' '}
                    {[
                        unlinkedCount > 0
                            ? unlinkedCount + ' rencana tanpa Surat Jalan'
                            : null,
                        missingWeightCount > 0
                            ? missingWeightCount + ' rencana tanpa berat'
                            : null,
                        missingAssignmentCount > 0
                            ? missingAssignmentCount +
                              ' trip tanpa penugasan armada'
                            : null,
                    ]
                        .filter(Boolean)
                        .join(' · ')}
                </div>
            )}
        </div>
    );
}
