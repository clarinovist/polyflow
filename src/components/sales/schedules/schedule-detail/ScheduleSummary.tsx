import { Card, CardContent } from '@/components/ui/card';
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
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
                <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                        Rencana Terjadwal
                    </p>
                    <p className="text-2xl font-bold">{allStops.length}</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                        Total Berat Rencana
                    </p>
                    <p className="text-2xl font-bold">
                        {allStops.length > 0 && !hasWeight
                            ? 'Belum diisi'
                            : `${totalPlannedKg.toLocaleString('id-ID')} kg`}
                    </p>
                    {missingWeightCount > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            {missingWeightCount} rencana belum memiliki berat
                        </p>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                        Rencana Tanpa SJ
                    </p>
                    <p
                        className={`text-2xl font-bold ${unlinkedCount > 0 ? 'text-orange-600' : ''}`}
                    >
                        {unlinkedCount}
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Trip</p>
                    <p className="text-2xl font-bold">{trips.length}</p>
                </CardContent>
            </Card>
        </div>
    );
}
