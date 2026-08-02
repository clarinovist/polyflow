'use client';

import {
    Route,
    MapPin,
    Clock,
    Info,
    Target,
    Check,
    PhoneIncoming,
} from 'lucide-react';
import {
    isValidCoordinate,
    haversineTotalDistance,
    estimateRouteDurationMinutes,
    formatDistance,
    formatDuration,
} from '@/lib/utils/geo';

type RouteStatsCustomer = {
    id: string;
    latitude: number | null;
    longitude: number | null;
};

export type RouteComplianceData = {
    assigned: number;
    visited: number;
    extraCalls: number;
    compliance: number;
};

type RouteStatsBarProps = {
    customers: RouteStatsCustomer[];
    totalCount: number;
    compliance?: RouteComplianceData;
};

export function RouteStatsBar({
    customers,
    totalCount,
    compliance,
}: RouteStatsBarProps) {
    const validCoords = customers.filter((c) =>
        isValidCoordinate(c.latitude, c.longitude),
    );
    const gpsCount = validCoords.length;

    const points = validCoords.map((c) => ({
        lat: c.latitude!,
        lon: c.longitude!,
    }));

    const distanceMeters = haversineTotalDistance(points);
    const durationMinutes = estimateRouteDurationMinutes({
        distanceMeters,
        stopCount: totalCount,
    });

    return (
        <div className="flex flex-wrap items-center gap-4 px-3 py-2 bg-muted/30 rounded-lg border text-xs">
            <div
                className="flex items-center gap-1.5"
                title="Estimasi jarak garis lurus antar-stop"
            >
                <Route className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold">
                    {formatDistance(distanceMeters)}
                </span>
                <span className="text-muted-foreground">jarak lurus</span>
            </div>

            <div
                className="flex items-center gap-1.5"
                title="Estimasi durasi perjalanan + kunjungan"
            >
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold">
                    {formatDuration(durationMinutes)}
                </span>
                <span className="text-muted-foreground">estimasi</span>
            </div>

            <div
                className="flex items-center gap-1.5"
                title="Jumlah customer dengan GPS yang valid"
            >
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold">
                    {gpsCount}/{totalCount}
                </span>
                <span className="text-muted-foreground">titik GPS</span>
            </div>

            {compliance && (
                <>
                    <div className="h-4 w-px bg-border hidden sm:block" />
                    {/* ponytail: compliance formula (visited - extraCalls)/assigned; change in route-plans.ts getRouteComplianceStats if product wants different rule */}
                    <div
                        className="flex items-center gap-1.5"
                        title="Jumlah toko yang direncanakan"
                    >
                        <Target className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-semibold">
                            {compliance.assigned}
                        </span>
                        <span className="text-muted-foreground">Rencana</span>
                    </div>
                    <div
                        className="flex items-center gap-1.5"
                        title="Jumlah toko yang sudah dikunjungi"
                    >
                        <Check className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-semibold">
                            {compliance.visited}
                        </span>
                        <span className="text-muted-foreground">
                            Dikunjungi
                        </span>
                    </div>
                    <div
                        className="flex items-center gap-1.5"
                        title="Kunjungan di luar rute yang direncanakan"
                    >
                        <PhoneIncoming className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-semibold">
                            {compliance.extraCalls}
                        </span>
                        <span className="text-muted-foreground">
                            Extra Call
                        </span>
                    </div>
                    <div
                        className="flex items-center gap-1.5"
                        title="Kepatuhan = (Dikunjungi - ExtraCall) / Rencana — extra call mengurangi skor"
                    >
                        <span className="font-semibold">
                            {compliance.compliance}%
                        </span>
                        <span className="text-muted-foreground">Kepatuhan</span>
                    </div>
                </>
            )}

            <div className="ml-auto group relative">
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-popover border rounded-lg shadow-sm text-[11px] text-muted-foreground leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                    Estimasi berdasarkan garis lurus, kecepatan rata-rata 30
                    km/jam, dan 15 menit per kunjungan. Bukan navigasi jalan.
                    {compliance && (
                        <>
                            <br />
                            <br />
                            Kepatuhan = (Dikunjungi − Extra Call) ÷ Rencana ×
                            100%. Extra call mengurangi skor.
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
