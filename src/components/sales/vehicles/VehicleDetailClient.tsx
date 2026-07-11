'use client';

import { useState } from 'react';
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
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-gray-100 text-gray-800',
  MAINTENANCE: 'bg-yellow-100 text-yellow-800',
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

function getKirStatus(kirExpireDateStr: string | null) {
  if (!kirExpireDateStr) return { label: 'Belum diisi', color: 'bg-gray-100 text-gray-800' };
  const expireDate = new Date(kirExpireDateStr);
  const now = new Date();
  expireDate.setHours(0,0,0,0);
  now.setHours(0,0,0,0);
  
  const diffTime = expireDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: `KADALUWARSA (${Math.abs(diffDays)} hari yang lalu)`, color: 'bg-red-100 text-red-800 border-red-300' };
  } else if (diffDays <= 30) {
    return { label: `SEGERA HABIS (${diffDays} hari sisa)`, color: 'bg-yellow-100 text-yellow-800 border-yellow-300 animate-pulse' };
  } else {
    return { label: `Aktif (sisa ${diffDays} hari)`, color: 'bg-green-100 text-green-800 border-green-300' };
  }
}

export function VehicleDetailClient({ vehicle }: VehicleDetailClientProps) {
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/sales/vehicles">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Kembali
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            {vehicle.plateNumber}
            <Badge className={STATUS_STYLES[vehicle.status] || ''}>{vehicle.status}</Badge>
          </h1>
          <p className="text-muted-foreground">{vehicle.name}</p>
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </Button>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Informasi Kendaraan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left Column: Details */}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block">{salesLabels.vehicleType}</span>
                <span className="font-medium">{VEHICLE_TYPE_LABELS[vehicle.vehicleType] || vehicle.vehicleType}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">{salesLabels.ownershipType}</span>
                <Badge variant={vehicle.ownershipType === 'FACTORY' ? 'default' : 'secondary'}>
                  {OWNERSHIP_LABELS[vehicle.ownershipType]}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground block">Pemilik</span>
                <span className="font-medium">{vehicle.ownerName || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">{salesLabels.driverName}</span>
                <span className="font-medium">{vehicle.driverName || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">{salesLabels.capacity}</span>
                <span className="font-medium">{vehicle.capacityKg ? `${vehicle.capacityKg.toLocaleString('id-ID')} Kg` : '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Total Pengiriman</span>
                <span className="font-medium">{vehicle._count.deliveryOrders}</span>
              </div>

              {/* KIR Info */}
              <div>
                <span className="text-muted-foreground block">Nomor KIR</span>
                <span className="font-medium">{vehicle.kirNumber || '-'}</span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground block">Status & Masa Berlaku KIR</span>
                <div className="flex items-center gap-2 mt-0.5">
                  {vehicle.kirExpireDate ? (
                    <>
                      <span className="font-medium">{formatDate(vehicle.kirExpireDate)}</span>
                      <Badge className={getKirStatus(vehicle.kirExpireDate).color}>
                        {getKirStatus(vehicle.kirExpireDate).label}
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="outline" className="text-gray-400">Belum diatur</Badge>
                  )}
                </div>
              </div>

              {vehicle.notes && (
                <div className="col-span-full">
                  <span className="text-muted-foreground block">Catatan</span>
                  <span className="font-medium">{vehicle.notes}</span>
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
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&q=80&w=400';
                    }}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                  <div className="p-3 bg-muted rounded-full mb-2">
                    <Car className="h-8 w-8 text-muted-foreground/60" />
                  </div>
                  <span className="text-xs">Belum ada foto</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tariffs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {salesLabels.tariffs}
            <Badge variant="secondary">{vehicle.tariffs.length}</Badge>
          </CardTitle>
          <VehicleTariffDialog
            mode="create"
            vehicleId={vehicle.id}
          />
        </CardHeader>
        <CardContent>
          {vehicle.tariffs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Belum ada tarif. Klik &quot;Tambah Tarif&quot; untuk menambahkan.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipe Tarif</TableHead>
                    <TableHead>Rute</TableHead>
                    <TableHead className="text-right">Biaya Oper.</TableHead>
                    <TableHead className="text-right">Biaya Customer</TableHead>
                    <TableHead>Min. Kg</TableHead>
                    <TableHead>Berlaku Dari</TableHead>
                    <TableHead>Sampai</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicle.tariffs.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Badge variant={t.rateType === 'PER_KG' ? 'default' : 'outline'}>
                          {RATE_TYPE_LABELS[t.rateType] || t.rateType}
                        </Badge>
                      </TableCell>
                      <TableCell>{t.routeName || 'Semua Rute'}</TableCell>
                      <TableCell className="text-right">{formatRupiah(t.costRate)}</TableCell>
                      <TableCell className="text-right font-medium">{formatRupiah(t.chargeRate)}</TableCell>
                      <TableCell>{t.minKg ? `${t.minKg} Kg` : '-'}</TableCell>
                      <TableCell>{formatDate(t.validFrom)}</TableCell>
                      <TableCell>{t.validUntil ? formatDate(t.validUntil) : 'Berlaku terus'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setEditTariff(t); setTariffDialogOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTariff(t.id)}
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
        initialData={vehicle as unknown as import('@prisma/client').Vehicle}
        open={editOpen}
        onOpenChange={(v) => { setEditOpen(v); }}
      />

      {/* Edit tariff dialog */}
      {editTariff && (
        <VehicleTariffDialog
          mode="edit"
          vehicleId={vehicle.id}
          initialData={editTariff as unknown as import('@prisma/client').VehicleTariff}
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
