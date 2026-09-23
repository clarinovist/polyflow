import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Trash2 } from 'lucide-react';
import type { Stop, Trip } from './types';
import {
    ACTIVITY_TYPE_STYLES,
    ACTIVITY_TYPE_LABELS,
    STOP_STATUS_STYLES,
    STOP_STATUS_LABELS,
    formatDateWithDay,
} from './presentation';

interface ScheduleStopsTableProps {
    allStops: (Stop & {
        tripId?: string;
        tripPlate?: string;
        tripDate?: string | null;
    })[];
    trips: Trip[];
    isEditable: boolean;
    isActionLoading: boolean;
    assignTripStopId: string;
    assignTripId: string;
    setAssignTripStopId: (value: string) => void;
    setAssignTripId: (value: string) => void;
    handleAssignToTrip: (stopId: string, tripId: string) => Promise<void>;
    handleRemoveStop: (stopId: string) => Promise<void>;
    onViewTrip: (tripId: string) => void;
}

export function ScheduleStopsTable({
    allStops,
    trips,
    isEditable,
    isActionLoading,
    assignTripStopId,
    assignTripId,
    setAssignTripStopId,
    setAssignTripId,
    handleAssignToTrip,
    handleRemoveStop,
    onViewTrip,
}: ScheduleStopsTableProps) {
    if (allStops.length === 0) {
        return (
            <div className="py-10 text-center text-sm text-muted-foreground">
                Belum ada SO yang dijadwalkan. Klik Tambah SO untuk memulai.
            </div>
        );
    }
    return (
        <Table className="[&_tbody_td]:align-top">
            <TableHeader>
                <TableRow>
                    <TableHead>Pesanan / Pelanggan</TableHead>
                    <TableHead>Trip / Tanggal</TableHead>
                    <TableHead className="text-right">Berat Rencana</TableHead>
                    <TableHead>Surat Jalan / Status</TableHead>
                    {isEditable && (
                        <TableHead className="text-right">
                            <span className="sr-only">Aksi</span>
                        </TableHead>
                    )}
                </TableRow>
            </TableHeader>
            <TableBody>
                {allStops.map((stop) => {
                    const order =
                        stop.salesOrder || stop.deliveryOrder?.salesOrder;
                    const reference =
                        stop.salesOrder?.orderNumber ||
                        stop.deliveryOrder?.orderNumber ||
                        stop.activityLabel ||
                        'Aktivitas';
                    const customer =
                        order?.customer?.name ||
                        stop.activityCustomer ||
                        stop.activityLabel ||
                        '—';
                    const items = order?.items || [];
                    return (
                        <TableRow key={stop.id}>
                            <TableCell className="min-w-48 max-w-80 whitespace-normal py-4">
                                <div className="font-medium">{reference}</div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                    {customer}
                                </div>
                                {stop.activityType !== 'DELIVERY' && (
                                    <Badge
                                        className={`mt-2 ${ACTIVITY_TYPE_STYLES[stop.activityType] || ''}`}
                                    >
                                        {ACTIVITY_TYPE_LABELS[
                                            stop.activityType
                                        ] || stop.activityType}
                                    </Badge>
                                )}
                                {items.length > 0 && (
                                    <details className="mt-2 text-xs">
                                        <summary className="w-fit cursor-pointer rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                                            {items.length} item · Lihat detail
                                        </summary>
                                        <ul className="mt-2 space-y-2 border-l pl-3 text-muted-foreground">
                                            {items.map((item) => (
                                                <li key={item.id}>
                                                    <span className="block text-foreground">
                                                        {
                                                            item.productVariant
                                                                .name
                                                        }
                                                    </span>
                                                    Sisa SO:{' '}
                                                    {(
                                                        Number(item.quantity) -
                                                        Number(
                                                            item.deliveredQty,
                                                        )
                                                    ).toLocaleString(
                                                        'id-ID',
                                                    )}{' '}
                                                    {
                                                        item.productVariant
                                                            .primaryUnit
                                                    }
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                )}
                            </TableCell>
                            <TableCell className="py-4">
                                {stop.tripId ? (
                                    <div className="space-y-1">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onViewTrip(stop.tripId!)
                                            }
                                            className="rounded-sm text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                                            aria-label={`Lihat trip ${stop.tripPlate}`}
                                        >
                                            {stop.tripPlate}
                                        </button>
                                        <div className="text-xs text-muted-foreground">
                                            {stop.tripDate
                                                ? formatDateWithDay(
                                                      stop.tripDate,
                                                  )
                                                : 'Tanggal belum diatur'}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <span className="text-sm text-muted-foreground">
                                            Belum diatur
                                        </span>
                                        {isEditable && trips.length > 0 && (
                                            <Select
                                                value={
                                                    assignTripStopId === stop.id
                                                        ? assignTripId
                                                        : ''
                                                }
                                                onValueChange={(value) => {
                                                    setAssignTripStopId(
                                                        stop.id,
                                                    );
                                                    setAssignTripId(value);
                                                    handleAssignToTrip(
                                                        stop.id,
                                                        value,
                                                    );
                                                }}
                                            >
                                                <SelectTrigger
                                                    className="h-9 w-36 text-xs"
                                                    aria-label={`Atur trip ${reference}`}
                                                >
                                                    <SelectValue placeholder="Atur Trip..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {trips
                                                        .filter(
                                                            (trip) =>
                                                                trip.status ===
                                                                    'PLANNED' ||
                                                                trip.status ===
                                                                    'CONFIRMED',
                                                        )
                                                        .map((trip) => (
                                                            <SelectItem
                                                                key={trip.id}
                                                                value={trip.id}
                                                            >
                                                                {trip.vehicle
                                                                    ?.plateNumber ||
                                                                    trip.externalPlate ||
                                                                    'Trip'}{' '}
                                                                (
                                                                {formatDateWithDay(
                                                                    trip.departureDate,
                                                                )}
                                                                )
                                                            </SelectItem>
                                                        ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                )}
                            </TableCell>
                            <TableCell className="py-4 text-right tabular-nums">
                                {stop.plannedWeightKg != null ? (
                                    `${stop.plannedWeightKg.toLocaleString('id-ID')} kg`
                                ) : (
                                    <span className="text-xs text-muted-foreground">
                                        Belum diisi
                                    </span>
                                )}
                            </TableCell>
                            <TableCell className="py-4">
                                <div className="space-y-2">
                                    {stop.deliveryOrder ? (
                                        <Link
                                            href="/sales/deliveries"
                                            className="text-sm underline underline-offset-4"
                                        >
                                            {stop.deliveryOrder.orderNumber}
                                        </Link>
                                    ) : (
                                        <div className="text-xs text-muted-foreground">
                                            Belum ada SJ
                                        </div>
                                    )}
                                    <Badge
                                        className={
                                            STOP_STATUS_STYLES[stop.status]
                                        }
                                    >
                                        {STOP_STATUS_LABELS[stop.status] ||
                                            stop.status}
                                    </Badge>
                                </div>
                            </TableCell>
                            {isEditable && (
                                <TableCell className="py-3 text-right">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Hapus rencana ${reference}`}
                                        onClick={() =>
                                            handleRemoveStop(stop.id)
                                        }
                                        disabled={isActionLoading}
                                    >
                                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                </TableCell>
                            )}
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
