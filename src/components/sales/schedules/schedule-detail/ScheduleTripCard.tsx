import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Car, FileText, Trash2, UserRound, MapPin } from 'lucide-react';
import type { Trip } from './types';
import { TripDistancePanel } from './TripDistancePanel';
import {
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
    const missingWeightCount = trip.orders.filter(
        (stop) => stop.plannedWeightKg == null,
    ).length;
    const hasWeight = trip.orders.some((stop) => stop.plannedWeightKg != null);
    const plate =
        trip.vehicle?.plateNumber ||
        trip.externalPlate ||
        trip.externalProvider ||
        'Tanpa Kendaraan';
    const driver = trip.vehicle?.driverName || trip.externalDriver;
    return (
        <article
            id={`schedule-trip-${trip.id}`}
            tabIndex={-1}
            aria-label={`Trip ${plate}${trip.runNumber ? ` · ${trip.runNumber}` : ''}`}
            className="flex h-full scroll-mt-6 flex-col rounded-lg border bg-card p-4 focus:outline-2 focus:outline-ring"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <Car className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-semibold">{plate}</h3>
                        {trip.runNumber && (
                            <Badge variant="outline">
                                Run {trip.runNumber}
                            </Badge>
                        )}
                        <Badge className={TRIP_STATUS_STYLES[trip.status]}>
                            {TRIP_STATUS_LABELS[trip.status] || trip.status}
                        </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {TRANSPORT_MODE_LABELS[trip.transportMode] ||
                            trip.transportMode}
                        {trip.vehicle?.name && ` · ${trip.vehicle.name}`}
                        {' · '}
                        {trip.departureDate
                            ? formatDateWithDay(trip.departureDate)
                            : 'Tanggal belum diatur'}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {driver && (
                            <span className="inline-flex items-center gap-1.5">
                                <UserRound className="h-3.5 w-3.5" />
                                {driver}
                            </span>
                        )}
                        {trip.routeName && (
                            <span className="inline-flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5" />
                                {trip.routeName}
                            </span>
                        )}
                    </div>
                </div>
                {isDRAFT &&
                    (trip.status === 'PLANNED' ||
                        trip.status === 'CANCELLED') && (
                        <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Hapus trip ${plate}`}
                            onClick={() =>
                                handleRemoveTrip(
                                    trip.id,
                                    trip.vehicle?.plateNumber || trip.externalPlate || 'Trip',
                                )
                            }
                            disabled={isActionLoading}
                        >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                    )}
            </div>

            {capacityKg != null && capacityKg > 0 && (
                <div className="mt-4 space-y-1.5">
                    <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                            Muatan:{' '}
                            {hasWeight
                                ? `${plannedKg.toLocaleString('id-ID')} / ${capacityKg.toLocaleString('id-ID')} kg`
                                : `Belum diisi · kapasitas ${capacityKg.toLocaleString('id-ID')} kg`}
                        </span>
                        {hasWeight && (
                            <span>
                                {utilizationPct}%
                                {missingWeightCount > 0 ? ' · sementara' : ''}
                            </span>
                        )}
                    </div>
                    {hasWeight && (
                        <div
                            role="meter"
                            aria-label="Kapasitas terpakai"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.min(utilizationPct, 100)}
                            aria-valuetext={`${utilizationPct}%${missingWeightCount > 0 ? ', berat belum lengkap' : ''}`}
                            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                        >
                            <div
                                className={`h-full rounded-full ${utilizationPct > 100 ? 'bg-red-500' : utilizationPct > 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
                                style={{
                                    width: `${Math.min(utilizationPct, 100)}%`,
                                }}
                            />
                        </div>
                    )}
                </div>
            )}
            {missingWeightCount > 0 && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    {missingWeightCount} rencana belum memiliki berat.
                </p>
            )}

            {trip.orders.length > 0 ? (
                <details className="mt-4 rounded-md bg-muted/30 p-3">
                    <summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
                        Daftar muatan · {trip.orders.length} rencana
                    </summary>
                    <ul className="mt-3 space-y-3">
                        {trip.orders.map((stop) => (
                            <li
                                key={stop.id}
                                className="flex flex-wrap justify-between gap-2 text-sm"
                            >
                                <div>
                                    <div className="font-medium">
                                        {stop.salesOrder?.orderNumber ||
                                            stop.deliveryOrder?.orderNumber ||
                                            stop.activityLabel ||
                                            'Aktivitas'}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {stop.salesOrder?.customer?.name ||
                                            stop.deliveryOrder?.salesOrder
                                                ?.customer?.name ||
                                            stop.activityCustomer}
                                    </div>
                                </div>
                                <div className="text-right text-xs text-muted-foreground">
                                    <div>
                                        {stop.plannedWeightKg != null
                                            ? `${stop.plannedWeightKg.toLocaleString('id-ID')} kg`
                                            : 'Berat belum diisi'}
                                    </div>
                                    <div>
                                        {stop.deliveryOrder?.orderNumber ||
                                            'Belum ada SJ'}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </details>
            ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                    Trip kosong — tambahkan SO melalui tab Rencana Kirim.
                </p>
            )}

            <TripDistancePanel key={`${trip.id}-${trip.mileage?.odometerStart ?? ''}-${trip.mileage?.odometerEnd ?? ''}`} trip={trip} />

            <div className="mt-auto flex flex-wrap gap-2 pt-4">
                {trip.status === 'PLANNED' && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTripStatus(trip.id, 'CONFIRMED')}
                        disabled={isActionLoading}
                    >
                        Konfirmasi Trip
                    </Button>
                )}
                {trip.status === 'CONFIRMED' && unlinkedInTrip === 0 && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTripStatus(trip.id, 'DEPARTED')}
                        disabled={isActionLoading}
                    >
                        Berangkat
                    </Button>
                )}
                {trip.status === 'CONFIRMED' && (
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTripStatus(trip.id, 'PLANNED')}
                        disabled={isActionLoading}
                    >
                        Batalkan Konfirmasi
                    </Button>
                )}
                {trip.status === 'DEPARTED' && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTripStatus(trip.id, 'COMPLETED')}
                        disabled={isActionLoading}
                    >
                        Selesai
                    </Button>
                )}
                {trip.orders.length > 0 && unlinkedInTrip > 0 && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGenerateDO(trip.id)}
                        disabled={isActionLoading}
                    >
                        <FileText className="mr-1 h-3.5 w-3.5" />
                        Buat SJ · {unlinkedInTrip} rencana
                    </Button>
                )}
            </div>
        </article>
    );
}
