'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ArrowLeft,
    Trash2,
    CheckCircle,
    Plus,
    Truck,
    Package,
    MoreHorizontal,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { ScheduleStatus, TripStatus } from '@prisma/client';
import {
    updateDeliverySchedule,
    updateTripStatus,
    removeVehicleFromSchedule,
    assignSalesOrderToTrip,
    generateDeliveryOrdersForTrip,
    removeOrderFromSchedule,
    listSchedulableSalesOrders,
    deleteDeliverySchedule,
    scheduleSOWithTrip,
} from '@/actions/sales/delivery-schedules';
import { getVehicles } from '@/actions/sales/vehicles';
import { EntityStatusTimeline } from '@/components/shared/EntityStatusTimeline';

import type {
    Schedule,
    SchedulableSO,
    Stop,
    Vehicle,
} from './schedule-detail/types';
import {
    STATUS_STYLES,
    STATUS_LABELS,
    TRIP_STATUS_LABELS,
    formatDate,
    formatDateWithDay,
} from './schedule-detail/presentation';
import { ScheduleSummary } from './schedule-detail/ScheduleSummary';
import { TripChoiceOptions } from './schedule-detail/TripChoiceOptions';
import { SalesOrderDetails } from './schedule-detail/SalesOrderDetails';
import { AddSalesOrderForm } from './schedule-detail/AddSalesOrderForm';
import { ScheduleStopsTable } from './schedule-detail/ScheduleStopsTable';
import { ScheduleTripCard } from './schedule-detail/ScheduleTripCard';

// ============================================
// Component
// ============================================

export function ScheduleDetailClient({ schedule }: { schedule: Schedule }) {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [schedulableSOs, setSchedulableSOs] = useState<SchedulableSO[]>([]);
    const [selectedSOId, setSelectedSOId] = useState('');
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const [tripChoice, setTripChoice] = useState('');
    const [plannedWeight, setPlannedWeight] = useState('');
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [deleteScheduleOpen, setDeleteScheduleOpen] = useState(false);
    const [removeTripTarget, setRemoveTripTarget] = useState<{
        id: string;
        plate: string;
    } | null>(null);
    const [removeStopId, setRemoveStopId] = useState<string | null>(null);
    const [showAddSO, setShowAddSO] = useState(false);
    const [assignTripStopId, setAssignTripStopId] = useState('');
    const [assignTripId, setAssignTripId] = useState('');
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('plan');
    const [focusedTripId, setFocusedTripId] = useState<string | null>(null);

    useEffect(() => {
        if (activeTab !== 'trips' || !focusedTripId) return;
        // Radix mounts the newly selected panel after the tab update.
        const frame = requestAnimationFrame(() => {
            document.getElementById(`schedule-trip-${focusedTripId}`)?.focus();
            setFocusedTripId(null);
        });
        return () => cancelAnimationFrame(frame);
    }, [activeTab, focusedTripId]);

    const loadData = useCallback(async () => {
        const [vehiclesRes, soRes] = await Promise.all([
            getVehicles({ status: 'ACTIVE' }),
            listSchedulableSalesOrders({ scheduleId: schedule.id }),
        ]);
        if (vehiclesRes.success && vehiclesRes.data)
            setVehicles(vehiclesRes.data as Vehicle[]);
        if (soRes.success && soRes.data)
            setSchedulableSOs(soRes.data as SchedulableSO[]);
    }, [schedule]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (selectedSOId) {
            const so = schedulableSOs.find((s) => s.id === selectedSOId);
            if (so) {
                // Only sum KG items for weight auto-fill
                const kgItems = so.items.filter(
                    (item) =>
                        item.productVariant.primaryUnit.toUpperCase() === 'KG',
                );
                const totalKg = kgItems.reduce((sum, item) => {
                    const rem =
                        Number(item.quantity) - Number(item.deliveredQty);
                    return sum + (rem > 0 ? rem : 0);
                }, 0);
                setPlannedWeight(
                    totalKg > 0 ? Math.round(totalKg).toString() : '',
                );
            }
        } else {
            setPlannedWeight('');
        }
    }, [selectedSOId, schedulableSOs]);

    const trips = schedule.vehicles;

    // Automatically set tripChoice when matching trips change
    useEffect(() => {
        const matchingTrips = trips.filter(
            (t) =>
                t.vehicleId === selectedVehicleId &&
                t.departureDate != null &&
                new Date(t.departureDate)
                    .toISOString()
                    .startsWith(selectedDate) &&
                (t.status === 'PLANNED' || t.status === 'CONFIRMED'),
        );
        if (matchingTrips.length === 1) {
            setTripChoice(matchingTrips[0].id);
        } else {
            setTripChoice('');
        }
    }, [selectedVehicleId, selectedDate, trips]);

    const allStops: (Stop & {
        tripId?: string;
        tripPlate?: string;
        tripDate?: string | null;
    })[] = [];
    trips.forEach((t) => {
        t.orders.forEach((o) => {
            allStops.push({
                ...o,
                tripId: t.id,
                tripPlate: t.vehicle?.plateNumber || t.externalPlate || '-',
                tripDate: t.departureDate,
            });
        });
    });

    // ============================================
    // Handlers
    // ============================================

    const handleStatusChange = async (newStatus: string) => {
        setIsActionLoading(true);
        try {
            const result = await updateDeliverySchedule(schedule.id, {
                status: newStatus as ScheduleStatus,
            });
            if (!result.success) {
                toast.error(result.error || 'Gagal update status.');
                return;
            }
            toast.success(`Status diubah ke "${STATUS_LABELS[newStatus]}".`);
            router.refresh();
        } catch {
            toast.error('Gagal update status.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDeleteSchedule = async () => {
        setIsActionLoading(true);
        try {
            const result = await deleteDeliverySchedule(schedule.id);
            if (!result.success) {
                toast.error(result.error || 'Gagal menghapus jadwal.');
                return;
            }
            toast.success('Jadwal pengiriman berhasil dihapus.');
            setDeleteScheduleOpen(false);
            router.push('/sales/delivery-schedules');
        } catch {
            toast.error('Gagal menghapus jadwal.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleAddSO = async () => {
        if (!selectedSOId || !selectedVehicleId || !selectedDate) {
            toast.error('Lengkapi SO, hari kirim, dan armada.');
            return;
        }
        setIsActionLoading(true);
        try {
            const existingTripId =
                tripChoice !== '' && tripChoice !== 'new'
                    ? tripChoice
                    : undefined;

            const result = await scheduleSOWithTrip(schedule.id, {
                salesOrderId: selectedSOId,
                vehicleId: selectedVehicleId,
                departureDate: new Date(selectedDate),
                plannedWeightKg: plannedWeight
                    ? parseFloat(plannedWeight)
                    : undefined,
                existingTripId,
            });
            if (!result.success) {
                toast.error(result.error || 'Gagal.');
                return;
            }
            toast.success('SO berhasil ditambahkan.');
            resetAddSO();
            router.refresh();
        } catch {
            toast.error('Gagal menambah SO.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const resetAddSO = () => {
        setSelectedSOId('');
        setSelectedVehicleId('');
        setSelectedDate('');
        setTripChoice('');
        setPlannedWeight('');
        setShowAddSO(false);
    };

    const handleAssignToTrip = async (stopId: string, tripId: string) => {
        setIsActionLoading(true);
        try {
            const stop = allStops.find((s) => s.id === stopId);
            if (!stop?.salesOrder) {
                toast.error('Stop tidak punya SO.');
                return;
            }
            const result = await assignSalesOrderToTrip(tripId, {
                salesOrderId: stop.salesOrder.id,
                plannedWeightKg: stop.plannedWeightKg ?? undefined,
            });
            if (!result.success) {
                toast.error(result.error || 'Gagal assign ke trip.');
                return;
            }
            toast.success('Berhasil dipindahkan ke trip.');
            setAssignTripStopId('');
            setAssignTripId('');
            router.refresh();
        } catch {
            toast.error('Gagal assign ke trip.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleTripStatus = async (tripId: string, newStatus: string) => {
        setIsActionLoading(true);
        try {
            const result = await updateTripStatus(
                tripId,
                newStatus as TripStatus,
            );
            if (!result.success) {
                toast.error(result.error || 'Gagal update status trip.');
                return;
            }
            toast.success(`Trip diubah ke "${TRIP_STATUS_LABELS[newStatus]}".`);
            router.refresh();
        } catch {
            toast.error('Gagal update status trip.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleRemoveTrip = async (tripId: string) => {
        setIsActionLoading(true);
        try {
            const result = await removeVehicleFromSchedule(tripId);
            if (!result.success) {
                toast.error(result.error || 'Gagal menghapus trip.');
                return;
            }
            toast.success('Trip berhasil dihapus.');
            setRemoveTripTarget(null);
            router.refresh();
        } catch {
            toast.error('Gagal menghapus trip.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleGenerateDO = async (tripId: string) => {
        setIsActionLoading(true);
        try {
            const result = await generateDeliveryOrdersForTrip(tripId);
            if (!result.success) {
                toast.error(result.error || 'Gagal generate SJ.');
                return;
            }
            const data = result.data as {
                ok: string[];
                failed: { stopId: string; error: string }[];
            };
            if (data.failed.length === 0) {
                toast.success(`${data.ok.length} Surat Jalan berhasil dibuat.`);
            } else {
                toast.warning(
                    `${data.ok.length} SJ dibuat, ${data.failed.length} gagal.`,
                );
            }
            router.refresh();
        } catch {
            toast.error('Gagal generate SJ.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleRemoveStop = async (stopId: string) => {
        setIsActionLoading(true);
        try {
            const result = await removeOrderFromSchedule(stopId);
            if (!result.success) {
                toast.error(result.error || 'Gagal menghapus.');
                return;
            }
            toast.success('Berhasil dihapus.');
            setRemoveStopId(null);
            router.refresh();
        } catch {
            toast.error('Gagal menghapus.');
        } finally {
            setIsActionLoading(false);
        }
    };

    // ============================================
    // Derived
    // ============================================

    const isDRAFT = schedule.status === 'DRAFT';
    const isEditable = ['DRAFT', 'ACTIVE', 'CONFIRMED', 'IN_TRANSIT'].includes(
        schedule.status,
    );

    const totalPlannedKg = allStops.reduce(
        (s, o) => s + (o.plannedWeightKg || 0),
        0,
    );
    const unlinkedCount = allStops.filter((o) => !o.deliveryOrder).length;
    const canDelete = allStops.length === unlinkedCount;

    const availableVehicles = vehicles;
    // Presentation only: retain original trip order for assignment and matching.
    const tripDays = new Map<string, typeof trips>();
    [...trips]
        .sort((a, b) =>
            (a.departureDate || '9999').localeCompare(
                b.departureDate || '9999',
            ),
        )
        .forEach((trip) => {
            const day = trip.departureDate
                ? formatDateWithDay(trip.departureDate)
                : 'Tanggal belum diatur';
            tripDays.set(day, [...(tripDays.get(day) || []), trip]);
        });

    // ============================================
    // Render
    // ============================================

    return (
        <div className="mx-auto w-full max-w-screen-2xl space-y-5 p-4 md:p-6">
            <header className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm lg:p-5 xl:sticky xl:top-4 xl:z-20 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 space-y-3">
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/sales/delivery-schedules">
                            <ArrowLeft className="h-4 w-4" />
                            Kembali
                        </Link>
                    </Button>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-semibold tracking-tight">
                                Jadwal Kirim
                            </h1>
                            <Badge className={STATUS_STYLES[schedule.status] || ''}>
                                {STATUS_LABELS[schedule.status]}
                            </Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {schedule.scheduleNumber} ·{' '}
                            {formatDate(schedule.weekStart)} —{' '}
                            {formatDate(schedule.weekEnd)}
                        </p>
                    </div>
                </div>
                <div
                    role="group"
                    aria-label="Aksi jadwal kirim"
                    className="flex flex-wrap items-center gap-2 [&_button]:min-h-11"
                >
                    {isDRAFT && (
                        <Button
                            onClick={() => handleStatusChange('ACTIVE')}
                            disabled={isActionLoading}
                            className="order-first"
                        >
                            <CheckCircle className="h-4 w-4" /> Aktifkan Jadwal
                        </Button>
                    )}
                    {isEditable && !isDRAFT && (
                        <Button
                            onClick={() => handleStatusChange('CLOSED')}
                            disabled={isActionLoading}
                            className="order-first"
                        >
                            <CheckCircle className="h-4 w-4" /> Tutup Minggu
                        </Button>
                    )}
                    {schedule.status === 'CLOSED' && (
                        <Button
                            onClick={() => handleStatusChange('ACTIVE')}
                            disabled={isActionLoading}
                            className="order-first"
                        >
                            <CheckCircle className="h-4 w-4" /> Buka Kembali
                        </Button>
                    )}
                    {canDelete && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    aria-label="Opsi jadwal"
                                    disabled={isActionLoading}
                                >
                                    <MoreHorizontal className="h-4 w-4" />
                                    Lainnya
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onSelect={() => setDeleteScheduleOpen(true)}
                                    disabled={isActionLoading}
                                    variant="destructive"
                                    className="min-h-11"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Hapus Jadwal
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </header>

            <AlertDialog
                open={deleteScheduleOpen}
                onOpenChange={(open) => {
                    if (!isActionLoading) setDeleteScheduleOpen(open);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Hapus jadwal pengiriman?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Semua trip dan rencana kirim di dalam{' '}
                            {schedule.scheduleNumber} akan ikut terhapus.
                            Tindakan ini tidak dapat dibatalkan.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isActionLoading}>
                            Kembali
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isActionLoading}
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={(event) => {
                                event.preventDefault();
                                void handleDeleteSchedule();
                            }}
                        >
                            Hapus Jadwal
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={removeTripTarget !== null}
                onOpenChange={(open) => {
                    if (!open && !isActionLoading) setRemoveTripTarget(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Hapus trip?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Trip {removeTripTarget?.plate || 'ini'} akan dihapus.
                            Stop di dalamnya akan dikembalikan ke status belum
                            diatur.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isActionLoading}>
                            Kembali
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isActionLoading || !removeTripTarget}
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={(event) => {
                                event.preventDefault();
                                if (removeTripTarget) {
                                    void handleRemoveTrip(removeTripTarget.id);
                                }
                            }}
                        >
                            Hapus Trip
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={removeStopId !== null}
                onOpenChange={(open) => {
                    if (!open && !isActionLoading) setRemoveStopId(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Hapus rencana pengiriman?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Pesanan akan dikeluarkan dari jadwal ini. Dokumen
                            pesanan asal tidak ikut dihapus.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isActionLoading}>
                            Kembali
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isActionLoading || !removeStopId}
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={(event) => {
                                event.preventDefault();
                                if (removeStopId) {
                                    void handleRemoveStop(removeStopId);
                                }
                            }}
                        >
                            Hapus Rencana
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Summary Cards */}
            <ScheduleSummary
                allStops={allStops}
                totalPlannedKg={totalPlannedKg}
                unlinkedCount={unlinkedCount}
                trips={trips}
            />

            <section
                aria-labelledby="schedule-workspace-title"
                className="space-y-3"
            >
                <div>
                    <h2
                        id="schedule-workspace-title"
                        className="text-lg font-semibold"
                    >
                        Ruang Kerja Jadwal
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Rencana, penugasan trip, dan audit dipisahkan agar mudah
                        dipindai.
                    </p>
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList
                        aria-label="Tampilan jadwal kirim"
                        className="h-auto w-full justify-start gap-1 overflow-x-auto sm:w-auto"
                    >
                        <TabsTrigger value="plan" className="min-h-11">
                        Rencana Kirim
                    </TabsTrigger>
                    <TabsTrigger value="trips" className="min-h-11">
                        Trip & Armada
                    </TabsTrigger>
                    <TabsTrigger value="history" className="min-h-11">
                        Riwayat
                    </TabsTrigger>
                    </TabsList>
                    <TabsContent value="plan" className="mt-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Package className="h-4 w-4" /> Rencana Kirim
                            </CardTitle>
                            {isEditable && (
                                <Button
                                    size="sm"
                                    onClick={() => setShowAddSO(!showAddSO)}
                                >
                                    <Plus className="h-3 w-3 mr-1" /> Tambah SO
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent>
                            {/* Add SO form */}
                            {showAddSO && (
                                <AddSalesOrderForm
                                    schedule={schedule}
                                    schedulableSOs={schedulableSOs}
                                    availableVehicles={availableVehicles}
                                    selectedSOId={selectedSOId}
                                    setSelectedSOId={setSelectedSOId}
                                    selectedVehicleId={selectedVehicleId}
                                    setSelectedVehicleId={setSelectedVehicleId}
                                    selectedDate={selectedDate}
                                    setSelectedDate={setSelectedDate}
                                    plannedWeight={plannedWeight}
                                    setPlannedWeight={setPlannedWeight}
                                    isActionLoading={isActionLoading}
                                    handleAddSO={handleAddSO}
                                    resetAddSO={resetAddSO}
                                    smartTripSelector={
                                        selectedVehicleId &&
                                        selectedDate &&
                                        (() => {
                                            const matchingTrips = trips.filter(
                                                (t) =>
                                                    t.vehicleId ===
                                                        selectedVehicleId &&
                                                    t.departureDate != null &&
                                                    new Date(t.departureDate)
                                                        .toISOString()
                                                        .startsWith(
                                                            selectedDate,
                                                        ) &&
                                                    (t.status === 'PLANNED' ||
                                                        t.status ===
                                                            'CONFIRMED'),
                                            );

                                            if (matchingTrips.length === 0) {
                                                return (
                                                    <div className="p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 text-xs text-green-700 dark:text-green-400">
                                                        ✨ Belum ada trip untuk
                                                        armada ini di hari
                                                        tersebut. Trip baru akan
                                                        dibuat otomatis.
                                                    </div>
                                                );
                                            }

                                            return (
                                                <TripChoiceOptions
                                                    matchingTrips={
                                                        matchingTrips
                                                    }
                                                    tripChoice={tripChoice}
                                                    setTripChoice={
                                                        setTripChoice
                                                    }
                                                />
                                            );
                                        })()
                                    }
                                    weightHint={
                                        selectedSOId &&
                                        (() => {
                                            const so = schedulableSOs.find(
                                                (s) => s.id === selectedSOId,
                                            );
                                            const nonKgItems =
                                                so?.items.filter(
                                                    (i) =>
                                                        i.productVariant.primaryUnit.toUpperCase() !==
                                                        'KG',
                                                ) ?? [];
                                            if (nonKgItems.length > 0) {
                                                return (
                                                    <p className="text-xs text-amber-600">
                                                        ⚠ Item non-KG tidak
                                                        dihitung otomatis (
                                                        {nonKgItems
                                                            .map(
                                                                (i) =>
                                                                    i
                                                                        .productVariant
                                                                        .primaryUnit,
                                                            )
                                                            .join(', ')}
                                                        )
                                                    </p>
                                                );
                                            }
                                            return (
                                                <p className="text-xs text-muted-foreground">
                                                    Auto-diisi dari sisa qty KG
                                                    di SO. Bisa diubah.
                                                </p>
                                            );
                                        })()
                                    }
                                    orderDetails={
                                        selectedSOId &&
                                        (() => {
                                            const so = schedulableSOs.find(
                                                (s) => s.id === selectedSOId,
                                            );
                                            if (!so) return null;
                                            return (
                                                <SalesOrderDetails so={so} />
                                            );
                                        })()
                                    }
                                />
                            )}

                            {/* Stops table */}
                            <ScheduleStopsTable
                                allStops={allStops}
                                trips={trips}
                                isEditable={isEditable}
                                isActionLoading={isActionLoading}
                                assignTripStopId={assignTripStopId}
                                assignTripId={assignTripId}
                                setAssignTripStopId={setAssignTripStopId}
                                setAssignTripId={setAssignTripId}
                                handleAssignToTrip={handleAssignToTrip}
                                handleRemoveStop={async (stopId) => {
                                    setRemoveStopId(stopId);
                                }}
                                onViewTrip={(tripId) => {
                                    setFocusedTripId(tripId);
                                    setActiveTab('trips');
                                }}
                            />

                            <p className="text-xs text-muted-foreground mt-3">
                                Estimasi plan &mdash; tagihan ongkir dari Surat
                                Jalan, bukan dari rencana ini.
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="trips" className="mt-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Truck className="h-4 w-4" /> Trip & Armada
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {trips.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    Belum ada trip. Buat trip untuk menentukan
                                    armada & tanggal kirim.
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {Array.from(tripDays, ([day, dayTrips]) => (
                                        <section
                                            key={day}
                                            className="space-y-3"
                                            aria-label={day}
                                        >
                                            <h2 className="text-sm font-semibold">
                                                {day}
                                            </h2>
                                            <div className="grid gap-3 xl:grid-cols-2">
                                                {dayTrips.map((trip) => {
                                                    const plannedKg =
                                                        trip.orders.reduce(
                                                            (s, o) =>
                                                                s +
                                                                (o.plannedWeightKg ||
                                                                    0),
                                                            0,
                                                        );
                                                    const capacityKg = trip
                                                        .vehicle?.capacityKg
                                                        ? Number(
                                                              trip.vehicle
                                                                  .capacityKg,
                                                          )
                                                        : null;
                                                    const utilizationPct =
                                                        capacityKg
                                                            ? Math.round(
                                                                  (plannedKg /
                                                                      capacityKg) *
                                                                      100,
                                                              )
                                                            : 0;
                                                    const unlinkedInTrip =
                                                        trip.orders.filter(
                                                            (o) =>
                                                                !o.deliveryOrder,
                                                        ).length;

                                                    return (
                                                        <ScheduleTripCard
                                                            key={trip.id}
                                                            trip={trip}
                                                            plannedKg={
                                                                plannedKg
                                                            }
                                                            capacityKg={
                                                                capacityKg
                                                            }
                                                            utilizationPct={
                                                                utilizationPct
                                                            }
                                                            unlinkedInTrip={
                                                                unlinkedInTrip
                                                            }
                                                            isDRAFT={isDRAFT}
                                                            isActionLoading={
                                                                isActionLoading
                                                            }
                                                            handleTripStatus={
                                                                handleTripStatus
                                                            }
                                                            handleRemoveTrip={async (
                                                                tripId,
                                                                plate,
                                                            ) => {
                                                                setRemoveTripTarget(
                                                                    {
                                                                        id: tripId,
                                                                        plate,
                                                                    },
                                                                );
                                                            }}
                                                            handleGenerateDO={
                                                                handleGenerateDO
                                                            }
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
                    <TabsContent value="history" className="mt-4">
                        <EntityStatusTimeline
                            entityType="DeliverySchedule"
                            entityId={schedule.id}
                        />
                    </TabsContent>
                </Tabs>
            </section>
        </div>
    );
}
