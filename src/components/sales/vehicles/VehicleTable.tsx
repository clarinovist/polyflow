'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Car, Pencil, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { deleteVehicle } from '@/actions/sales/vehicles';
import { VehicleDialog } from './VehicleDialog';
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

interface VehicleRow {
  id: string;
  plateNumber: string;
  name: string;
  vehicleType: string;
  ownershipType: string;
  ownerName: string | null;
  driverName: string | null;
  capacityKg: number | null;
  status: string;
  tariffs: Array<{ chargeRate: number; rateType: string }>;
  _count: { deliveryOrders: number };
}

interface VehicleTableProps {
  vehicles: VehicleRow[];
}

export function VehicleTable({ vehicles }: VehicleTableProps) {
  const [filterOwnership, setFilterOwnership] = useState<string>('ALL');
  const [editVehicle, setEditVehicle] = useState<VehicleRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const router = useRouter();

  const filtered = useMemo(() => {
    if (filterOwnership === 'ALL') return vehicles;
    return vehicles.filter((v) => v.ownershipType === filterOwnership);
  }, [vehicles, filterOwnership]);

  const handleDelete = async (id: string, plateNumber: string) => {
    if (!window.confirm(`Yakin ingin menonaktifkan kendaraan "${plateNumber}"?`)) {
      return;
    }
    const result = await deleteVehicle(id);
    if (result.success) {
      toast.success(`Kendaraan "${plateNumber}" berhasil dinonaktifkan.`);
      router.refresh();
    } else {
      toast.error(result.error || 'Gagal menonaktifkan kendaraan.');
    }
  };

  return (
    <>
      {/* Desktop */}
      <Card className="hidden md:block">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            {salesLabels.vehicles}
          </CardTitle>
          <div className="flex items-center gap-3">
            <Select value={filterOwnership} onValueChange={setFilterOwnership}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Semua Kepemilikan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Kepemilikan</SelectItem>
                <SelectItem value="FACTORY">Milik Pabrik</SelectItem>
                <SelectItem value="PRIVATE">Milik Perorangan</SelectItem>
              </SelectContent>
            </Select>
            <VehicleDialog mode="create" />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Belum ada kendaraan terdaftar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Polisi</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Pemilik</TableHead>
                  <TableHead>Sopir</TableHead>
                  <TableHead className="text-right">Kapasitas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <Link
                        href={`/sales/vehicles/${v.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {v.plateNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{v.name}</TableCell>
                    <TableCell>{VEHICLE_TYPE_LABELS[v.vehicleType] || v.vehicleType}</TableCell>
                    <TableCell>
                      <Badge variant={v.ownershipType === 'FACTORY' ? 'default' : 'secondary'}>
                        {OWNERSHIP_LABELS[v.ownershipType] || v.ownershipType}
                      </Badge>
                    </TableCell>
                    <TableCell>{v.driverName || '-'}</TableCell>
                    <TableCell className="text-right">
                      {v.capacityKg ? `${v.capacityKg} Kg` : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_STYLES[v.status] || ''}>
                        {v.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditVehicle(v);
                            setEditOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(v.id, v.plateNumber)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Mobile */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between">
          <Select value={filterOwnership} onValueChange={setFilterOwnership}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Kepemilikan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua</SelectItem>
              <SelectItem value="FACTORY">Pabrik</SelectItem>
              <SelectItem value="PRIVATE">Perorangan</SelectItem>
            </SelectContent>
          </Select>
          <VehicleDialog mode="create" trigger={
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Baru</Button>
          } />
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Belum ada kendaraan.
          </div>
        ) : (
          filtered.map((v) => (
            <Card key={v.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <Link
                    href={`/sales/vehicles/${v.id}`}
                    className="font-bold text-blue-600 hover:underline"
                  >
                    {v.plateNumber}
                  </Link>
                  <p className="text-sm text-muted-foreground">{v.name}</p>
                </div>
                <Badge className={STATUS_STYLES[v.status] || ''}>{v.status}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Tipe: </span>
                  {VEHICLE_TYPE_LABELS[v.vehicleType] || v.vehicleType}
                </div>
                <div>
                  <span className="text-muted-foreground">Pemilik: </span>
                  {OWNERSHIP_LABELS[v.ownershipType]}
                </div>
                {v.driverName && (
                  <div>
                    <span className="text-muted-foreground">Sopir: </span>
                    {v.driverName}
                  </div>
                )}
                {v.capacityKg && (
                  <div>
                    <span className="text-muted-foreground">Kapasitas: </span>
                    {v.capacityKg} Kg
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1"
                  onClick={() => { setEditVehicle(v); setEditOpen(true); }}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-red-600"
                  onClick={() => handleDelete(v.id, v.plateNumber)}>
                  <Trash2 className="h-4 w-4 mr-1" /> Hapus
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Edit dialog */}
      {editVehicle && (
        <VehicleDialog
          mode="edit"
          initialData={editVehicle as unknown as import('@prisma/client').Vehicle}
          open={editOpen}
          onOpenChange={(v) => {
            setEditOpen(v);
            if (!v) setEditVehicle(null);
          }}
        />
      )}
    </>
  );
}
