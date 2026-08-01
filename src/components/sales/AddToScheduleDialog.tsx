'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CalendarPlus, Plus, Calendar, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
    getDeliverySchedules,
    scheduleSOWithTrip,
    createDeliverySchedule,
} from '@/actions/sales/delivery-schedules';
import { getVehicles } from '@/actions/sales/vehicles';

interface ScheduleTrip {
    id: string;
    vehicleId: string;
    departureDate: Date | null;
    status: string;
    sequence: number;
    vehicle: {
        id: string;
        plateNumber: string;
        name: string;
        driverName: string | null;
    } | null;
    orders: { id: string }[];
}

interface DeliverySchedule {
    id: string;
    scheduleNumber: string;
    status: string;
    weekStart: Date;
    weekEnd: Date;
    trips: ScheduleTrip[];
}

interface Vehicle {
    id: string;
    plateNumber: string;
    name: string;
    driverName?: string | null;
}

export function AddToScheduleDialog({
    salesOrderId,
}: {
    salesOrderId: string;
}) {
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [schedules, setSchedules] = useState<DeliverySchedule[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [selectedScheduleId, setSelectedScheduleId] = useState('');
    const [selectedTripId, setSelectedTripId] = useState('');
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const router = useRouter();

    const loadData = useCallback(async () => {
        const [schedulesRes, vehiclesRes] = await Promise.all([
            getDeliverySchedules(),
            getVehicles({ status: 'ACTIVE' }),
        ]);
        if (schedulesRes.success && schedulesRes.data) {
            const all = schedulesRes.data as DeliverySchedule[];
            setSchedules(
                all.filter(
                    (s) => s.status === 'DRAFT' || s.status === 'ACTIVE',
                ),
            );
        }
        if (vehiclesRes.success && vehiclesRes.data)
            setVehicles(vehiclesRes.data as Vehicle[]);
    }, []);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        (async () => {
            await loadData();
            if (cancelled) return;
        })();
        return () => {
            cancelled = true;
        };
    }, [open, loadData]);

    const selectedSchedule = schedules.find((s) => s.id === selectedScheduleId);
    const availableTrips = (selectedSchedule?.trips ?? []).filter(
        (t) => t.status === 'PLANNED' || t.status === 'CONFIRMED',
    );

    const resetForm = () => {
        setSelectedScheduleId('');
        setSelectedTripId('');
        setSelectedVehicleId('');
        setSelectedDate('');
    };

    const handleSubmit = async () => {
        if (!selectedScheduleId) {
            toast.error('Pilih jadwal terlebih dahulu');
            return;
        }

        const useExistingTrip = !!selectedTripId;
        if (useExistingTrip) {
            // Existing trip — just need schedule + trip
        } else {
            if (!selectedVehicleId) {
                toast.error('Pilih kendaraan untuk trip baru');
                return;
            }
            if (!selectedDate) {
                toast.error('Pilih tanggal keberangkatan');
                return;
            }
        }

        setIsLoading(true);
        try {
            const departureDate = useExistingTrip
                ? new Date(
                      availableTrips.find((t) => t.id === selectedTripId)
                          ?.departureDate || new Date(),
                  )
                : new Date(selectedDate);

            const result = await scheduleSOWithTrip(selectedScheduleId, {
                salesOrderId,
                vehicleId: useExistingTrip
                    ? availableTrips.find((t) => t.id === selectedTripId)
                          ?.vehicleId || ''
                    : selectedVehicleId,
                departureDate,
                existingTripId: useExistingTrip ? selectedTripId : undefined,
            });

            if (!result.success) {
                toast.error(
                    (result as { error?: string }).error ||
                        'Gagal menambahkan SO ke jadwal',
                );
                return;
            }

            toast.success('SO berhasil ditambahkan ke jadwal kirim');
            setOpen(false);
            resetForm();
            router.refresh();
        } catch {
            toast.error('Gagal menambahkan SO ke jadwal. Silakan coba lagi.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateNewSchedule = async () => {
        setIsLoading(true);
        try {
            const result = await createDeliverySchedule();
            if (!result.success) {
                toast.error(
                    (result as { error?: string }).error ||
                        'Gagal membuat jadwal baru',
                );
                return;
            }
            const newSchedule: DeliverySchedule = {
                ...(result.data as Omit<DeliverySchedule, 'trips'>),
                trips: [],
            };
            setSchedules((prev) => [newSchedule, ...prev]);
            setSelectedScheduleId(newSchedule.id);
            toast.success(
                `Jadwal ${newSchedule.scheduleNumber} berhasil dibuat. Silakan pilih kendaraan & tanggal.`,
            );
        } catch {
            toast.error('Gagal membuat jadwal baru. Silakan coba lagi.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                setOpen(v);
                if (!v) resetForm();
            }}
        >
            <DialogTrigger asChild>
                <Button variant="outline" className="shadow-sm">
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    Tambah ke Jadwal
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-blue-600" />
                        Tambah ke Jadwal Kirim
                    </DialogTitle>
                    <DialogDescription>
                        Pilih jadwal aktif, lalu pilih trip existing atau buat
                        trip baru untuk SO ini.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    {/* Schedule picker */}
                    <div className="space-y-2">
                        <Label>Jadwal Kirim *</Label>
                        {schedules.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-4 text-center space-y-3">
                                <p className="text-sm text-muted-foreground">
                                    Belum ada jadwal aktif minggu ini.
                                </p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCreateNewSchedule}
                                    disabled={isLoading}
                                >
                                    <Plus className="mr-2 h-3.5 w-3.5" />
                                    Buat Jadwal Baru
                                </Button>
                            </div>
                        ) : (
                            <Select
                                value={selectedScheduleId}
                                onValueChange={(v) => {
                                    setSelectedScheduleId(v);
                                    setSelectedTripId('');
                                    setSelectedVehicleId('');
                                    setSelectedDate('');
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Pilih jadwal..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {schedules.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.scheduleNumber} —{' '}
                                            {s.status === 'DRAFT'
                                                ? 'Draft'
                                                : 'Aktif'}
                                            {' | '}
                                            {s.trips.length} trip
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {/* Trip selection (existing trips or new trip form) */}
                    {selectedSchedule && (
                        <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
                            <Label className="text-sm font-medium">
                                Pilih Trip
                            </Label>
                            {availableTrips.length > 0 && (
                                <div className="space-y-2">
                                    <Select
                                        value={selectedTripId}
                                        onValueChange={(v) => {
                                            setSelectedTripId(v);
                                            setSelectedVehicleId('');
                                            setSelectedDate('');
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Pilih trip existing..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableTrips.map((t) => (
                                                <SelectItem
                                                    key={t.id}
                                                    value={t.id}
                                                >
                                                    <Truck className="inline h-3.5 w-3.5 mr-1" />
                                                    {t.vehicle?.plateNumber ||
                                                        'N/A'}{' '}
                                                    — {t.vehicle?.name || ''}
                                                    {t.departureDate
                                                        ? ` (${new Date(t.departureDate).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })})`
                                                        : ''}
                                                    {` [${t.orders.length} SO]`}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        Atau isi di bawah untuk membuat trip
                                        baru:
                                    </p>
                                </div>
                            )}

                            {/* New trip fields */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Kendaraan</Label>
                                    <Select
                                        value={selectedVehicleId}
                                        onValueChange={setSelectedVehicleId}
                                        disabled={!!selectedTripId}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Pilih kendaraan..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {vehicles.map((v) => (
                                                <SelectItem
                                                    key={v.id}
                                                    value={v.id}
                                                >
                                                    {v.plateNumber} — {v.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">
                                        Tanggal Kirim
                                    </Label>
                                    <input
                                        type="date"
                                        value={selectedDate}
                                        onChange={(e) =>
                                            setSelectedDate(e.target.value)
                                        }
                                        disabled={!!selectedTripId}
                                        min={
                                            new Date(selectedSchedule.weekStart)
                                                .toISOString()
                                                .split('T')[0]
                                        }
                                        max={
                                            new Date(selectedSchedule.weekEnd)
                                                .toISOString()
                                                .split('T')[0]
                                        }
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => {
                            setOpen(false);
                            resetForm();
                        }}
                    >
                        Batal
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isLoading || !selectedScheduleId}
                        className="bg-purple-600 hover:bg-purple-700"
                    >
                        {isLoading ? (
                            <>
                                <span className="h-3 w-3 border-2 border-background/30 border-t-background rounded-full animate-spin mr-2" />
                                Menyimpan...
                            </>
                        ) : (
                            'Tambahkan'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
