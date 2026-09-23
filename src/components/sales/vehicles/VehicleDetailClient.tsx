'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Pencil, Trash2, Car } from 'lucide-react';
import { toast } from 'sonner';
import { deleteVehicleTariff } from '@/actions/sales/vehicle-tariffs';
import { VehicleDialog } from './VehicleDialog';
import { VehicleTariffDialog } from './VehicleTariffDialog';
import { salesLabels } from '@/lib/labels';
import { KirBadge } from './FleetReading';

const VEHICLE_TYPE_LABELS: Record<string, string> = {
    MOBIL_BOX: 'Mobil Box',
    L300: 'L300',
    COLD_CONTAINER: 'Cold Container',
    TRONTON: 'Tronton',
    MOTOR: 'Motor',
    OTHER: 'Lainnya',
};

const OWNERSHIP_LABELS: Record<string, string> = {
    FACTORY: 'Pabrik',
    PRIVATE: 'Perorangan',
};

const STATUS_STYLES: Record<string, string> = {
    ACTIVE: 'bg-muted text-foreground',
    INACTIVE: 'bg-muted text-muted-foreground',
    MAINTENANCE: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
};

const RATE_TYPE_LABELS: Record<string, string> = {
    PER_KG: 'Per Kg',
    FLAT_RATE: 'Flat Rate',
};

interface Tariff {
    id: string;
    rateType: string;
    costRate: number;
    chargeRate: number;
    routeName: string | null;
    minKg: number | null;
    validFrom: string; // ISO string
    validUntil: string | null; // ISO string
    notes: string | null;
    customerId: string | null;
    customerName: string | null;
}

interface Vehicle {
    id: string;
    plateNumber: string;
    name: string;
    vehicleType: string;
    ownershipType: string;
    ownerName: string | null;
    driverName: string | null;
    capacityKg: number | null;
    status: string;
    notes: string | null;
    photoUrl: string | null;
    kirNumber: string | null;
    kirExpireDate: string | null;
    tariffs: Tariff[];
    _count: { deliveryOrders: number };
}

interface VehicleDetailClientProps {
    vehicle: Vehicle;
    children?: ReactNode;
}

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

export function VehicleDetailClient({ vehicle, children }: VehicleDetailClientProps) {
    const [editOpen, setEditOpen] = useState(false);
    const [editTariff, setEditTariff] = useState<Tariff | null>(null);
    const [tariffDialogOpen, setTariffDialogOpen] = useState(false);
    const router = useRouter();

    const handleDeleteTariff = async (tariffId: string) => {
        if (!window.confirm('Yakin ingin menghapus tarif ini?')) return;
        const result = await deleteVehicleTariff(tariffId);
        if (result.success) {
            toast.success('Tarif berhasil dihapus.');
            router.refresh();
        } else {
            toast.error(result.error || 'Gagal menghapus tarif.');
        }
    };

    return (
        <div className="p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-4">
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/sales/vehicles"><ArrowLeft className="h-4 w-4 mr-1" /> Kembali</Link>
                </Button>
                <div className="order-last w-full md:order-none md:w-auto md:flex-1 min-w-0">
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-3 break-words">
                        {vehicle.plateNumber}
                        <Badge className={STATUS_STYLES[vehicle.status] || ''}>
                            {vehicle.status}
                        </Badge>
                    </h1>
                    <p className="text-muted-foreground">{vehicle.name}</p>
                </div>
                <Button className="ml-auto" variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
            </div>

            <nav aria-label="Bagian detail armada" className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
                <a className="underline underline-offset-4" href="#vehicle-summary">Ringkasan</a>
                <a className="underline underline-offset-4" href="#vehicle-trips">Perjalanan & pengiriman</a>
                <a className="underline underline-offset-4" href="#vehicle-kir">Dokumen & KIR</a>
                <a className="underline underline-offset-4" href="#vehicle-tariffs">Tarif</a>
            </nav>
            <p className="text-sm text-muted-foreground">Status aktif bukan jaminan kendaraan tersedia. Jadwal dan riwayat servis belum tersedia; KM pengiriman bukan seluruh pemakaian kendaraan.</p>
            {/* Info Card */}
            <Card id="vehicle-summary">
                <CardHeader>
                    <CardTitle>Informasi Kendaraan</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Left Column: Details */}
                        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <div>
                                <span className="text-muted-foreground block">
                                    {salesLabels.vehicleType}
                                </span>
                                <span className="font-medium">
                                    {VEHICLE_TYPE_LABELS[vehicle.vehicleType] ||
                                        vehicle.vehicleType}
                                </span>
                            </div>
                            <div>
                                <span className="text-muted-foreground block">
                                    {salesLabels.ownershipType}
                                </span>
                                <Badge
                                    variant={
                                        vehicle.ownershipType === 'FACTORY'
                                            ? 'default'
                                            : 'secondary'
                                    }
                                >
                                    {OWNERSHIP_LABELS[vehicle.ownershipType]}
                                </Badge>
                            </div>
                            <div>
                                <span className="text-muted-foreground block">
                                    Pemilik
                                </span>
                                <span className="font-medium">
                                    {vehicle.ownerName || '-'}
                                </span>
                            </div>
                            <div>
                                <span className="text-muted-foreground block">
                                    {salesLabels.driverName}
                                </span>
                                <span className="font-medium">
                                    {vehicle.driverName || '-'}
                                </span>
                            </div>
                            <div>
                                <span className="text-muted-foreground block">
                                    {salesLabels.capacity}
                                </span>
                                <span className="font-medium">
                                    {vehicle.capacityKg
                                        ? `${vehicle.capacityKg.toLocaleString('id-ID')} Kg`
                                        : '-'}
                                </span>
                            </div>
                            <div>
                                <span className="text-muted-foreground block">
                                    SJ tertaut (semua status)
                                </span>
                                <span className="font-medium">
                                    {vehicle._count.deliveryOrders}
                                </span>
                            </div>

                            {/* KIR Info */}
                            <div>
                                <span className="text-muted-foreground block">
                                    Nomor KIR
                                </span>
                                <span className="font-medium">
                                    {vehicle.kirNumber || '-'}
                                </span>
                            </div>
                            <div className="col-span-2" id="vehicle-kir">
                                <span className="text-muted-foreground block">
                                    Status & Masa Berlaku KIR
                                </span>
                                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                    {vehicle.kirExpireDate && <span className="font-medium">{new Date(vehicle.kirExpireDate).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium' })}</span>}
                                    <KirBadge expiry={vehicle.kirExpireDate} />
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">Berdasarkan tanggal dokumen, bukan KM. Riwayat pembaruan dan rencana pemeriksaan belum dicatat.</p>
                            </div>

                            {vehicle.notes && (
                                <div className="col-span-full">
                                    <span className="text-muted-foreground block">
                                        Catatan
                                    </span>
                                    <span className="font-medium">
                                        {vehicle.notes}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Right Column: Truck Photo */}
                        <div className="w-full md:w-56 flex flex-col items-center justify-center border rounded-lg p-3 bg-muted/20">
                            {vehicle.photoUrl ? (
                                <div className="relative w-full aspect-video md:aspect-square rounded-md overflow-hidden bg-muted">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={vehicle.photoUrl}
                                        alt={vehicle.name}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            // Fallback if image fails to load
                                            (e.target as HTMLImageElement).src =
                                                'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&q=80&w=400';
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                                    <div className="p-3 bg-muted rounded-full mb-2">
                                        <Car className="h-8 w-8 text-muted-foreground/60" />
                                    </div>
                                    <span className="text-xs">
                                        Belum ada foto
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div id="vehicle-trips">{children}</div>
            {/* Tariffs */}
            <Card id="vehicle-tariffs">
                <CardHeader className="flex flex-row flex-wrap gap-3 items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        {salesLabels.tariffs}
                        <Badge variant="secondary">
                            {vehicle.tariffs.length}
                        </Badge>
                    </CardTitle>
                    <VehicleTariffDialog mode="create" vehicleId={vehicle.id} />
                </CardHeader>
                <CardContent>
                    {vehicle.tariffs.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            Belum ada tarif. Klik &quot;Tambah Tarif&quot; untuk
                            menambahkan.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Tipe Tarif</TableHead>
                                        <TableHead>Rute</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead className="text-right">
                                            Biaya Oper.
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Biaya Customer
                                        </TableHead>
                                        <TableHead>Min. Kg</TableHead>
                                        <TableHead>Berlaku Dari</TableHead>
                                        <TableHead>Sampai</TableHead>
                                        <TableHead className="text-right">
                                            Aksi
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {vehicle.tariffs.map((t) => (
                                        <TableRow key={t.id}>
                                            <TableCell>
                                                <Badge
                                                    variant={
                                                        t.rateType === 'PER_KG'
                                                            ? 'default'
                                                            : 'outline'
                                                    }
                                                >
                                                    {RATE_TYPE_LABELS[
                                                        t.rateType
                                                    ] || t.rateType}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {t.routeName || 'Semua Rute'}
                                            </TableCell>
                                            <TableCell>
                                                {t.customerName ? (
                                                    <Badge variant="outline" className="text-xs">
                                                        {t.customerName}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">
                                                        Semua Customer
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {formatRupiah(t.costRate)}
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                {formatRupiah(t.chargeRate)}
                                            </TableCell>
                                            <TableCell>
                                                {t.minKg
                                                    ? `${t.minKg} Kg`
                                                    : '-'}
                                            </TableCell>
                                            <TableCell>
                                                {formatDate(t.validFrom)}
                                            </TableCell>
                                            <TableCell>
                                                {t.validUntil
                                                    ? formatDate(t.validUntil)
                                                    : 'Berlaku terus'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        aria-label="Edit tarif"
                                                        onClick={() => {
                                                            setEditTariff(t);
                                                            setTariffDialogOpen(
                                                                true,
                                                            );
                                                        }}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        aria-label="Hapus tarif"
                                                        onClick={() =>
                                                            handleDeleteTariff(
                                                                t.id,
                                                            )
                                                        }
                                                    >
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Edit vehicle dialog */}
            <VehicleDialog
                mode="edit"
                initialData={
                    vehicle as unknown as import('@prisma/client').Vehicle
                }
                open={editOpen}
                onOpenChange={(v) => {
                    setEditOpen(v);
                }}
            />

            {/* Edit tariff dialog */}
            {editTariff && (
                <VehicleTariffDialog
                    mode="edit"
                    vehicleId={vehicle.id}
                    initialData={
                        editTariff as unknown as import('@prisma/client').VehicleTariff
                    }
                    open={tariffDialogOpen}
                    onOpenChange={(v) => {
                        setTariffDialogOpen(v);
                        if (!v) setEditTariff(null);
                    }}
                />
            )}
        </div>
    );
}
