'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import {
    CustomerCombobox,
    type CustomerComboboxOption,
} from '@/components/customers/CustomerCombobox';
import { VehicleTariffDialog } from '@/components/sales/vehicles/VehicleTariffDialog';

interface TariffRow {
    id: string;
    vehicleId: string;
    rateType: string;
    costRate: number;
    chargeRate: number;
    routeName: string | null;
    validFrom: string;
    validUntil: string | null;
    customerId: string | null;
    vehicle: { plateNumber: string; name: string };
    customer: { id: string; name: string } | null;
}

interface VehicleOption {
    id: string;
    plateNumber: string;
    name: string;
}

const RATE_TYPE_LABELS: Record<string, string> = {
    PER_KG: 'Per Kg',
    FLAT_RATE: 'Flat Rate',
};

function formatRupiah(amount: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    }).format(amount);
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

interface TariffListClientProps {
    tariffs: TariffRow[];
    customers: CustomerComboboxOption[];
    vehicles: VehicleOption[];
}

export function TariffListClient({
    tariffs,
    customers,
    vehicles,
}: TariffListClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentCustomer = searchParams.get('customer') || '';
    const currentVehicle = searchParams.get('vehicle') || '';

    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedVehicleForAdd, setSelectedVehicleForAdd] = useState('');

    const filteredTariffs = useMemo(() => {
        return tariffs.filter((t) => {
            if (currentCustomer && t.customerId !== currentCustomer) return false;
            if (currentVehicle && t.vehicleId !== currentVehicle) return false;
            return true;
        });
    }, [tariffs, currentCustomer, currentVehicle]);

    const handleCustomerChange = (customerId: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (customerId) {
            params.set('customer', customerId);
        } else {
            params.delete('customer');
        }
        router.push(`/sales/tariffs?${params.toString()}`, { scroll: false });
    };

    const handleVehicleChange = (vehicleId: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (vehicleId === '__all__') {
            params.delete('vehicle');
        } else {
            params.set('vehicle', vehicleId);
        }
        router.push(`/sales/tariffs?${params.toString()}`, { scroll: false });
    };

    const handleAddTariff = () => {
        if (!selectedVehicleForAdd) return;
        setDialogOpen(true);
    };

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
                <CustomerCombobox
                    customers={customers}
                    value={currentCustomer}
                    onChange={handleCustomerChange}
                    placeholder="Semua customer"
                    className="h-9 w-[220px] text-sm"
                />
                <Select
                    value={currentVehicle || '__all__'}
                    onValueChange={handleVehicleChange}
                >
                    <SelectTrigger className="w-[200px] h-9 text-sm">
                        <SelectValue placeholder="Semua armada" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__all__">Semua armada</SelectItem>
                        {vehicles.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                                {v.plateNumber} — {v.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="flex items-center gap-2 ml-auto">
                    <Select
                        value={selectedVehicleForAdd || ''}
                        onValueChange={setSelectedVehicleForAdd}
                    >
                        <SelectTrigger className="w-[200px] h-9 text-sm">
                            <SelectValue placeholder="Pilih armada untuk tambah..." />
                        </SelectTrigger>
                        <SelectContent>
                            {vehicles.map((v) => (
                                <SelectItem key={v.id} value={v.id}>
                                    {v.plateNumber} — {v.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        size="sm"
                        onClick={handleAddTariff}
                        disabled={!selectedVehicleForAdd}
                        title={
                            !selectedVehicleForAdd
                                ? 'Pilih armada dulu untuk menambah tarif'
                                : undefined
                        }
                    >
                        <Plus className="h-4 w-4 mr-1" />
                        Tambah Tarif
                    </Button>
                </div>
            </div>

            {/* Table */}
            {filteredTariffs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    Belum ada tarif. Pilih armada lalu klik &quot;Tambah
                    Tarif&quot;.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Armada</TableHead>
                                <TableHead>Rute</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Tipe Tarif</TableHead>
                                <TableHead className="text-right">
                                    Biaya Oper.
                                </TableHead>
                                <TableHead className="text-right">
                                    Biaya Customer
                                </TableHead>
                                <TableHead>Berlaku Dari</TableHead>
                                <TableHead>Sampai</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTariffs.map((t) => (
                                <TableRow key={t.id}>
                                    <TableCell>
                                        <span className="font-medium">
                                            {t.vehicle.plateNumber}
                                        </span>
                                        <span className="text-muted-foreground text-xs ml-1">
                                            {t.vehicle.name}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        {t.routeName || 'Semua Rute'}
                                    </TableCell>
                                    <TableCell>
                                        {t.customer ? (
                                            <Badge
                                                variant="outline"
                                                className="text-xs"
                                            >
                                                {t.customer.name}
                                            </Badge>
                                        ) : (
                                            <span className="text-muted-foreground text-xs">
                                                Semua Customer
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={
                                                t.rateType === 'PER_KG'
                                                    ? 'default'
                                                    : 'outline'
                                            }
                                        >
                                            {RATE_TYPE_LABELS[t.rateType] ||
                                                t.rateType}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatRupiah(t.costRate)}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {formatRupiah(t.chargeRate)}
                                    </TableCell>
                                    <TableCell>
                                        {formatDate(t.validFrom)}
                                    </TableCell>
                                    <TableCell>
                                        {t.validUntil
                                            ? formatDate(t.validUntil)
                                            : 'Berlaku terus'}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Add Tariff Dialog */}
            {selectedVehicleForAdd && (
                <VehicleTariffDialog
                    mode="create"
                    vehicleId={selectedVehicleForAdd}
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                />
            )}
        </div>
    );
}
