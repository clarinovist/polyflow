import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import type { Schedule, SchedulableSO, Vehicle } from './types';
import { formatDateWithDay } from './presentation';

interface AddSalesOrderFormProps {
    schedule: Schedule;
    schedulableSOs: SchedulableSO[];
    availableVehicles: Vehicle[];
    selectedSOId: string;
    setSelectedSOId: (value: string) => void;
    selectedVehicleId: string;
    setSelectedVehicleId: (value: string) => void;
    selectedDate: string;
    setSelectedDate: (value: string) => void;
    plannedWeight: string;
    setPlannedWeight: (value: string) => void;
    isActionLoading: boolean;
    handleAddSO: () => Promise<void>;
    resetAddSO: () => void;
    smartTripSelector: ReactNode;
    weightHint: ReactNode;
    orderDetails: ReactNode;
}

export function AddSalesOrderForm({
    schedule,
    schedulableSOs,
    availableVehicles,
    selectedSOId,
    setSelectedSOId,
    selectedVehicleId,
    setSelectedVehicleId,
    selectedDate,
    setSelectedDate,
    plannedWeight,
    setPlannedWeight,
    isActionLoading,
    handleAddSO,
    resetAddSO,
    smartTripSelector,
    weightHint,
    orderDetails,
}: AddSalesOrderFormProps) {
    return (
        <div className="mb-4 p-4 border rounded-lg bg-muted/30 space-y-4">
            {/* Row 1: Sales Order */}
            <div className="space-y-1.5 w-full">
                <label className="text-sm font-medium text-muted-foreground">
                    Sales Order
                </label>
                <Select
                    value={selectedSOId}
                    onValueChange={setSelectedSOId}
                >
                    <SelectTrigger className="w-full h-10">
                        <SelectValue placeholder="Pilih SO (sisa qty > 0)..." />
                    </SelectTrigger>
                    <SelectContent>
                        {schedulableSOs.map((so) => (
                            <SelectItem
                                key={so.id}
                                value={so.id}
                            >
                                {so.orderNumber} —{' '}
                                {so.customer?.name || 'N/A'}
                                {so.alreadyPlanned
                                    ? ' ⚠️ sudah dijadwalkan'
                                    : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Hari Kirim & Armada */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">
                        Hari / Tanggal Kirim
                    </label>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) =>
                            setSelectedDate(e.target.value)
                        }
                        min={schedule.weekStart.split('T')[0]}
                        max={schedule.weekEnd.split('T')[0]}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    {selectedDate && (
                        <span className="text-xs text-muted-foreground block">
                            📅 {formatDateWithDay(selectedDate)}
                        </span>
                    )}
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">
                        Armada / Kendaraan
                    </label>
                    <Select
                        value={selectedVehicleId}
                        onValueChange={setSelectedVehicleId}
                    >
                        <SelectTrigger className="w-full h-10">
                            <SelectValue placeholder="Pilih kendaraan..." />
                        </SelectTrigger>
                        <SelectContent>
                            {availableVehicles.map((v) => (
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
            </div>

            {/* Smart Trip Selector */}
            {smartTripSelector}

            {/* Weight & Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="space-y-1.5 md:col-span-6">
                    <label className="text-sm font-medium text-muted-foreground">
                        Berat Rencana (kg, opsional)
                    </label>
                    <input
                        type="number"
                        value={plannedWeight}
                        onChange={(e) =>
                            setPlannedWeight(e.target.value)
                        }
                        placeholder="Contoh: 1200"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    {weightHint}
                </div>

                <div className="flex gap-2 md:col-span-6 h-10 items-center justify-end">
                    <Button
                        onClick={handleAddSO}
                        disabled={
                            isActionLoading ||
                            !selectedSOId ||
                            !selectedVehicleId ||
                            !selectedDate
                        }
                        className="h-10 px-4"
                    >
                        <Plus className="h-4 w-4 mr-1" /> Tambah
                        ke Rencana
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={resetAddSO}
                        className="h-10 px-4"
                    >
                        Batal
                    </Button>
                </div>
            </div>
            {orderDetails}
            <p className="text-xs text-muted-foreground">
                SO yang ditambahkan akan masuk rencana minggu
                ini. Selanjutnya tentukan truk & tanggal di
                section Trip.
            </p>
        </div>
    );
}
