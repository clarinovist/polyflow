'use client';

import { Route, MapPin, Clock, Info } from 'lucide-react';
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

type RouteStatsBarProps = {
    customers: RouteStatsCustomer[];
    totalCount: number;
};

export function RouteStatsBar({ customers, totalCount }: RouteStatsBarProps) {
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
            <div className="flex items-center gap-1.5" title="Estimasi jarak garis lurus antar-stop">
                <Route className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold">{formatDistance(distanceMeters)}</span>
                <span className="text-muted-foreground">jarak lurus</span>
            </div>

            <div className="flex items-center gap-1.5" title="Estimasi durasi perjalanan + kunjungan">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold">{formatDuration(durationMinutes)}</span>
                <span className="text-muted-foreground">estimasi</span>
            </div>

            <div className="flex items-center gap-1.5" title="Jumlah customer dengan GPS yang valid">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold">{gpsCount}/{totalCount}</span>
                <span className="text-muted-foreground">titik GPS</span>
            </div>

            <div className="ml-auto group relative">
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-popover border rounded-lg shadow-sm text-[11px] text-muted-foreground leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                    Estimasi berdasarkan garis lurus, kecepatan rata-rata 30 km/jam,
                    dan 15 menit per kunjungan. Bukan navigasi jalan.
                </div>
            </div>
        </div>
    );
}
