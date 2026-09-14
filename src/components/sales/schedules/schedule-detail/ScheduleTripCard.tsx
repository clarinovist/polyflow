import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Car, FileText, Trash2 } from 'lucide-react';
import type { Trip } from './types';
import {
    TRANSPORT_MODE_STYLES,
    TRANSPORT_MODE_LABELS,
    TRIP_STATUS_STYLES,
    TRIP_STATUS_LABELS,
    formatDateWithDay,
} from './presentation';

interface ScheduleTripCardProps {
    trip: Trip;
    plannedKg: number;
    capacityKg: number | null;
    utilizationPct: number;
    unlinkedInTrip: number;
    isDRAFT: boolean;
    isActionLoading: boolean;
    handleTripStatus: (tripId: string, newStatus: string) => Promise<void>;
    handleRemoveTrip: (tripId: string, plate: string) => Promise<void>;
    handleGenerateDO: (tripId: string) => Promise<void>;
}

export function ScheduleTripCard({
    trip,
    plannedKg,
    capacityKg,
    utilizationPct,
    unlinkedInTrip,
    isDRAFT,
    isActionLoading,
    handleTripStatus,
    handleRemoveTrip,
    handleGenerateDO,
}: ScheduleTripCardProps) {
    return (
        <div
            key={trip.id}
            className="border rounded-lg p-4"
        >
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <Car className="h-4 w-4" />
                    {trip.vehicle ? (
                        <>
                            <span className="font-medium">
                                {trip.vehicle.plateNumber}
                            </span>
                            <span className="text-muted-foreground">
                                — {trip.vehicle.name}
                            </span>
                            {trip.vehicle.driverName && (
                                <Badge variant="outline">
                                    {trip.vehicle.driverName}
                                </Badge>
                            )}
                        </>
                    ) : (
                        <span className="font-medium text-muted-foreground">
                            {trip.externalPlate || trip.externalProvider || 'Tanpa Kendaraan'}
                        </span>
                    )}
                    <Badge className={TRANSPORT_MODE_STYLES[trip.transportMode] || ''}>
                        {TRANSPORT_MODE_LABELS[trip.transportMode] || trip.transportMode}
                    </Badge>
                    {trip.runNumber && (
                        <Badge variant="outline">Run {trip.runNumber}</Badge>
                    )}
                    <Badge className={TRIP_STATUS_STYLES[trip.status]}>
                        {TRIP_STATUS_LABELS[trip.status]}
                    </Badge>
                    {trip.departureDate && (
                        <span className="text-sm text-muted-foreground">
                            📅{' '}
                            {formatDateWithDay(
                                trip.departureDate,
                            )}
                        </span>
                    )}
                    {trip.routeName && (
                        <span className="text-sm text-muted-foreground">
                            🗺 {trip.routeName}
                        </span>
                    )}
                </div>
                <div className="flex gap-1 items-center">
                    {trip.status === 'PLANNED' && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                handleTripStatus(
                                    trip.id,
                                    'CONFIRMED',
                                )
                            }
                            disabled={
                                isActionLoading
                            }
                        >
                            Konfirmasi
                        </Button>
                    )}
                    {trip.status === 'CONFIRMED' &&
                        unlinkedInTrip === 0 && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                    handleTripStatus(
                                        trip.id,
                                        'DEPARTED',
                                    )
                                }
                                disabled={
                                    isActionLoading
                                }
                            >
                                Berangkat
                            </Button>
                        )}
                    {trip.status ===
                        'CONFIRMED' && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                                handleTripStatus(
                                    trip.id,
                                    'PLANNED',
                                )
                            }
                            disabled={
                                isActionLoading
                            }
                        >
                            Batal
                        </Button>
                    )}
                    {trip.status === 'DEPARTED' && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                handleTripStatus(
                                    trip.id,
                                    'COMPLETED',
                                )
                            }
                            disabled={
                                isActionLoading
                            }
                        >
                            Selesai
                        </Button>
                    )}
                    {isDRAFT &&
                        (trip.status ===
                            'PLANNED' ||
                            trip.status ===
                                'CANCELLED') && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                    handleRemoveTrip(
                                        trip.id,
                                        trip.vehicle?.plateNumber || trip.externalPlate || 'Trip',
                                    )
                                }
                                disabled={
                                    isActionLoading
                                }
                            >
                                <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                        )}
                </div>
            </div>

            {/* Capacity bar */}
            {capacityKg && (
                <div className="mb-2">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>
                            Kapasitas:{' '}
                            {plannedKg.toLocaleString(
                                'id-ID',
                            )}{' '}
                            /{' '}
                            {capacityKg.toLocaleString(
                                'id-ID',
                            )}{' '}
                            kg
                        </span>
                        <span>
                            {utilizationPct}%
                        </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                            className={`h-1.5 rounded-full ${utilizationPct > 100 ? 'bg-red-500' : utilizationPct > 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
                            style={{
                                width: `${Math.min(utilizationPct, 100)}%`,
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Stops in this trip */}
            {trip.orders.length > 0 ? (
                <div className="text-sm space-y-1">
                    {trip.orders.map((o) => (
                        <div
                            key={o.id}
                            className="flex items-center justify-between text-muted-foreground"
                        >
                            <span>
                                {o.salesOrder
                                    ?.orderNumber ||
                                    o.deliveryOrder
                                        ?.orderNumber ||
                                    '-'}
                            </span>
                            <span>
                                {o.plannedWeightKg
                                    ? `${o.plannedWeightKg.toLocaleString('id-ID')} kg`
                                    : ''}
                            </span>
                        </div>
                    ))}
                    {unlinkedInTrip > 0 && (
                        <div className="flex gap-2 mt-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                    handleGenerateDO(
                                        trip.id,
                                    )
                                }
                                disabled={
                                    isActionLoading
                                }
                            >
                                <FileText className="h-3 w-3 mr-1" />{' '}
                                Buat Semua SJ (
                                {unlinkedInTrip})
                            </Button>
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-sm text-muted-foreground italic">
                    Trip kosong — assign SO dari
                    section atas.
                </p>
            )}
        </div>
    );
}
