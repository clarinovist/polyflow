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
}: ScheduleStopsTableProps) {
    return (
        allStops.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
                Belum ada SO yang dijadwalkan. Klik Tambah SO untuk
                memulai.
            </div>
        ) : (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>No. SO</TableHead>
                        <TableHead>Aktivitas</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">
                            Berat Rencana
                        </TableHead>
                        <TableHead>Surat Jalan</TableHead>
                        <TableHead>Trip</TableHead>
                        <TableHead>Status</TableHead>
                        {isEditable && (
                            <TableHead className="text-right">
                                Aksi
                            </TableHead>
                        )}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {allStops.map((stop, idx) => (
                        <TableRow key={stop.id}>
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell className="font-medium">
                                <div>
                                    {stop.salesOrder?.orderNumber ||
                                        stop.deliveryOrder
                                            ?.orderNumber ||
                                        '-'}
                                </div>
                                {(() => {
                                    const items =
                                        stop.salesOrder?.items ||
                                        stop.deliveryOrder
                                            ?.salesOrder?.items;
                                    if (
                                        !items ||
                                        items.length === 0
                                    )
                                        return null;
                                    return (
                                        <div className="text-[10px] text-muted-foreground font-normal mt-1 leading-tight space-y-0.5 max-w-[200px]">
                                            {items.map((item) => {
                                                const rem =
                                                    Number(
                                                        item.quantity,
                                                    ) -
                                                    Number(
                                                        item.deliveredQty,
                                                    );
                                                return (
                                                    <div
                                                        key={
                                                            item.id
                                                        }
                                                        className="truncate"
                                                        title={`${item.productVariant.name} (${rem.toLocaleString('id-ID')} ${item.productVariant.primaryUnit} sisa)`}
                                                    >
                                                        •{' '}
                                                        {
                                                            item
                                                                .productVariant
                                                                .name
                                                        }{' '}
                                                        (
                                                        {rem.toLocaleString(
                                                            'id-ID',
                                                        )}{' '}
                                                        {
                                                            item
                                                                .productVariant
                                                                .primaryUnit
                                                        }{' '}
                                                        sisa)
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-1">
                                    <Badge className={ACTIVITY_TYPE_STYLES[stop.activityType] || ''}>
                                        {ACTIVITY_TYPE_LABELS[stop.activityType] || stop.activityType}
                                    </Badge>
                                </div>
                            </TableCell>
                            <TableCell>
                                {stop.salesOrder?.customer?.name ||
                                    stop.deliveryOrder?.salesOrder
                                        ?.customer?.name ||
                                    stop.activityCustomer ||
                                    stop.activityLabel ||
                                    '-'}
                            </TableCell>
                            <TableCell className="text-right">
                                {stop.plannedWeightKg
                                    ? `${stop.plannedWeightKg.toLocaleString('id-ID')} kg`
                                    : '-'}
                            </TableCell>
                            <TableCell>
                                {stop.deliveryOrder ? (
                                    <Link
                                        href="/sales/deliveries"
                                        className="text-blue-600 hover:underline text-sm"
                                    >
                                        {
                                            stop.deliveryOrder
                                                .orderNumber
                                        }
                                    </Link>
                                ) : (
                                    <span className="text-muted-foreground text-sm">
                                        —
                                    </span>
                                )}
                            </TableCell>
                            <TableCell>
                                {stop.tripId ? (
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-1">
                                            <Badge
                                                variant="outline"
                                                className="text-xs"
                                            >
                                                {stop.tripPlate}
                                            </Badge>
                                        </div>
                                        {stop.tripDate && (
                                            <span className="text-[10px] text-muted-foreground">
                                                {formatDateWithDay(
                                                    stop.tripDate,
                                                )}
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs text-orange-600 italic">
                                            Belum diatur
                                        </span>
                                        {isEditable &&
                                            trips.length > 0 && (
                                                <Select
                                                    value={
                                                        assignTripStopId ===
                                                        stop.id
                                                            ? assignTripId
                                                            : ''
                                                    }
                                                    onValueChange={(
                                                        v,
                                                    ) => {
                                                        setAssignTripStopId(
                                                            stop.id,
                                                        );
                                                        setAssignTripId(
                                                            v,
                                                        );
                                                        handleAssignToTrip(
                                                            stop.id,
                                                            v,
                                                        );
                                                    }}
                                                >
                                                    <SelectTrigger className="h-7 w-[130px] text-xs">
                                                        <SelectValue placeholder="Atur Trip..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {trips
                                                            .filter(
                                                                (
                                                                    t,
                                                                ) =>
                                                                    t.status ===
                                                                        'PLANNED' ||
                                                                    t.status ===
                                                                        'CONFIRMED',
                                                            )
                                                            .map(
                                                                (
                                                                    t,
                                                                ) => (
                                                                    <SelectItem
                                                                        key={
                                                                            t.id
                                                                        }
                                                                        value={
                                                                            t.id
                                                                        }
                                                                    >
                                                                        {t
                                                                            .vehicle
                                                                            ?.plateNumber || t.externalPlate || 'Trip'}{' '}
                                                                        (
                                                                        {formatDateWithDay(
                                                                            t.departureDate,
                                                                        )}

                                                                        )
                                                                    </SelectItem>
                                                                ),
                                                            )}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                    </div>
                                )}
                            </TableCell>
                            <TableCell>
                                <Badge
                                    className={
                                        STOP_STATUS_STYLES[
                                            stop.status
                                        ]
                                    }
                                >
                                    {
                                        STOP_STATUS_LABELS[
                                            stop.status
                                        ]
                                    }
                                </Badge>
                            </TableCell>
                            {isEditable && (
                                <TableCell className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                            handleRemoveStop(
                                                stop.id,
                                            )
                                        }
                                        disabled={isActionLoading}
                                    >
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        )
    );
}
