'use client';

import { useState, useEffect, useCallback } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Car, Trash2, CheckCircle, PlayCircle, Package } from 'lucide-react';
import { toast } from 'sonner';
import {
  updateDeliverySchedule,
  assignVehicleToSchedule,
  removeVehicleFromSchedule,
  assignOrderToSchedule,
  removeOrderFromSchedule,
} from '@/actions/sales/delivery-schedules';
import { getVehicles } from '@/actions/sales/vehicles';
import { getDeliveryOrders } from '@/actions/inventory/deliveries';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  IN_TRANSIT: 'bg-purple-100 text-purple-800',
  COMPLETED: 'bg-green-100 text-green-800',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Dikonfirmasi',
  IN_TRANSIT: 'Dalam Perjalanan',
  COMPLETED: 'Selesai',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

interface Vehicle {
  id: string;
  plateNumber: string;
  name: string;
  ownershipType: string;
  driverName?: string | null;
  status: string;
}

interface DeliveryOrder {
  id: string;
  orderNumber: string;
  deliveryDate: string;
  totalCharge: number | null;
  salesOrder?: {
    orderNumber: string;
    customer?: { name: string } | null;
  } | null;
}

interface ScheduleVehicle {
  id: string;
  vehicleId: string;
  departureDate: string | null;
  notes: string | null;
  vehicle: { id: string; plateNumber: string; name: string; driverName: string | null; ownershipType: string };
  orders: {
    id: string;
    deliveryOrder: DeliveryOrder;
  }[];
}

interface Schedule {
  id: string;
  scheduleNumber: string;
  weekStart: string;
  weekEnd: string;
  status: string;
  notes: string | null;
  vehicles: ScheduleVehicle[];
  createdBy: { name: string | null } | null;
}

interface ScheduleDetailClientProps {
  schedule: Schedule;
}

export function ScheduleDetailClient({ schedule }: ScheduleDetailClientProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [pendingDOs, setPendingDOs] = useState<DeliveryOrder[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedDOId, setSelectedDOId] = useState('');
  const [selectedSVId, setSelectedSVId] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const router = useRouter();

  const loadData = useCallback(async () => {
    const [vehiclesRes, dosRes] = await Promise.all([
      getVehicles({ status: 'ACTIVE' }),
      getDeliveryOrders(),
    ]);
    if (vehiclesRes.success && vehiclesRes.data) {
      setVehicles(vehiclesRes.data as Vehicle[]);
    }
    if (dosRes.success && dosRes.data) {
      // Filter: only PENDING/SHIPPED DOs not already in this schedule
      const assignedDOIds = new Set(
        schedule.vehicles.flatMap((sv) => sv.orders.map((o) => o.deliveryOrder.id))
      );
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const allDOs: any[] = (dosRes.data || []) as any[];
      const available = allDOs.filter(
        (d: any) => !assignedDOIds.has(d.id) && (d.deliveryDate <= schedule.weekEnd)
      );
      setPendingDOs(available);
    }
  }, [schedule]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusChange = async (newStatus: string) => {
    setIsActionLoading(true);
    try {
      const result = await updateDeliverySchedule(schedule.id, { status: newStatus as any });
      if (!result.success) {
        toast.error(result.error || 'Gagal update status.');
        return;
      }
      toast.success(`Status jadwal diubah ke "${STATUS_LABELS[newStatus] || newStatus}".`);
      router.refresh();
    } catch {
      toast.error('Gagal update status.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleAssignVehicle = async () => {
    if (!selectedVehicleId) {
      toast.error('Pilih kendaraan terlebih dahulu.');
      return;
    }
    setIsActionLoading(true);
    try {
      const result = await assignVehicleToSchedule(schedule.id, selectedVehicleId);
      if (!result.success) {
        toast.error(result.error || 'Gagal menugaskan armada.');
        return;
      }
      toast.success('Armada berhasil ditugaskan.');
      setSelectedVehicleId('');
      router.refresh();
    } catch {
      toast.error('Gagal menugaskan armada.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRemoveVehicle = async (svId: string, plateNumber: string) => {
    if (!window.confirm(`Yakin ingin menghapus armada "${plateNumber}" dari jadwal?`)) return;
    setIsActionLoading(true);
    try {
      const result = await removeVehicleFromSchedule(svId);
      if (!result.success) {
        toast.error(result.error || 'Gagal menghapus armada.');
        return;
      }
      toast.success('Armada berhasil dihapus dari jadwal.');
      router.refresh();
    } catch {
      toast.error('Gagal menghapus armada.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleAssignDO = async () => {
    if (!selectedDOId || !selectedSVId) {
      toast.error('Pilih armada dan Surat Jalan.');
      return;
    }
    setIsActionLoading(true);
    try {
      const result = await assignOrderToSchedule(selectedSVId, selectedDOId);
      if (!result.success) {
        toast.error(result.error || 'Gagal menambahkan Surat Jalan.');
        return;
      }
      toast.success('Surat Jalan berhasil ditambahkan.');
      setSelectedDOId('');
      setSelectedSVId('');
      router.refresh();
    } catch {
      toast.error('Gagal menambahkan Surat Jalan.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRemoveDO = async (scheduleOrderId: string) => {
    if (!window.confirm('Yakin ingin menghapus Surat Jalan dari jadwal ini?')) return;
    setIsActionLoading(true);
    try {
      const result = await removeOrderFromSchedule(scheduleOrderId);
      if (!result.success) {
        toast.error(result.error || 'Gagal menghapus Surat Jalan.');
        return;
      }
      toast.success('Surat Jalan berhasil dihapus.');
      router.refresh();
    } catch {
      toast.error('Gagal menghapus Surat Jalan.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const isDRAFT = schedule.status === 'DRAFT';
  const totalDO = schedule.vehicles.reduce((sum, sv) => sum + sv.orders.length, 0);
  const totalCharge = schedule.vehicles.reduce(
    (sum, sv) => sum + sv.orders.reduce((s, o) => s + (o.deliveryOrder.totalCharge || 0), 0),
    0
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/sales/delivery-schedules">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Kembali
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            {schedule.scheduleNumber}
            <Badge className={STATUS_STYLES[schedule.status] || ''}>
              {STATUS_LABELS[schedule.status]}
            </Badge>
          </h1>
          <p className="text-muted-foreground">
            {formatDate(schedule.weekStart)} — {formatDate(schedule.weekEnd)}
          </p>
        </div>
        {isDRAFT && (
          <div className="flex gap-2">
            <Button onClick={() => handleStatusChange('CONFIRMED')} disabled={isActionLoading}>
              <CheckCircle className="h-4 w-4 mr-2" /> Konfirmasi
            </Button>
          </div>
        )}
        {schedule.status === 'CONFIRMED' && (
          <Button onClick={() => handleStatusChange('IN_TRANSIT')} disabled={isActionLoading}>
            <PlayCircle className="h-4 w-4 mr-2" /> Mulai Kirim
          </Button>
        )}
        {schedule.status === 'IN_TRANSIT' && (
          <Button onClick={() => handleStatusChange('COMPLETED')} disabled={isActionLoading}>
            <CheckCircle className="h-4 w-4 mr-2" /> Selesai
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Armada Ditugaskan</p>
            <p className="text-2xl font-bold">{schedule.vehicles.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Surat Jalan</p>
            <p className="text-2xl font-bold">{totalDO}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Biaya Kirim</p>
            <p className="text-2xl font-bold">{formatRupiah(totalCharge)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Dibuat Oleh</p>
            <p className="text-2xl font-bold">{schedule.createdBy?.name || '-'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Assign DO section (only in DRAFT) */}
      {isDRAFT && pendingDOs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" /> Tambah Surat Jalan ke Jadwal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="space-y-1">
                <label className="text-sm font-medium">Pilih Armada</label>
                <Select value={selectedSVId} onValueChange={setSelectedSVId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih armada..." />
                  </SelectTrigger>
                  <SelectContent>
                    {schedule.vehicles.map((sv) => (
                      <SelectItem key={sv.id} value={sv.id}>
                        {sv.vehicle.plateNumber} — {sv.vehicle.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Pilih Surat Jalan</label>
                <Select value={selectedDOId} onValueChange={setSelectedDOId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih DO..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pendingDOs.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.orderNumber} — {d.salesOrder?.customer?.name || 'N/A'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAssignDO} disabled={isActionLoading || !selectedDOId || !selectedSVId}>
                <Package className="h-4 w-4 mr-2" /> Tambahkan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vehicles with assigned orders */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Car className="h-5 w-5" /> Armada Ditugaskan
          </h2>
          {isDRAFT && (
            <div className="flex items-center gap-2">
              <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Pilih armada..." />
                </SelectTrigger>
                <SelectContent>
                  {vehicles
                    .filter((v) => !schedule.vehicles.some((sv) => sv.vehicleId === v.id))
                    .map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.plateNumber} — {v.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleAssignVehicle} disabled={isActionLoading || !selectedVehicleId}>
                <Car className="h-4 w-4 mr-1" /> Tambah
              </Button>
            </div>
          )}
        </div>

        {schedule.vehicles.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Belum ada armada ditugaskan. Tambah armada untuk mulai mengatur jadwal.
            </CardContent>
          </Card>
        ) : (
          schedule.vehicles.map((sv) => (
            <Card key={sv.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  {sv.vehicle.plateNumber}
                  <span className="text-muted-foreground font-normal">— {sv.vehicle.name}</span>
                  {sv.vehicle.driverName && (
                    <Badge variant="outline">{sv.vehicle.driverName}</Badge>
                  )}
                  <Badge variant={sv.vehicle.ownershipType === 'FACTORY' ? 'default' : 'secondary'}>
                    {sv.vehicle.ownershipType === 'FACTORY' ? 'Pabrik' : 'Perorangan'}
                  </Badge>
                </CardTitle>
                {isDRAFT && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveVehicle(sv.id, sv.vehicle.plateNumber)}
                    disabled={isActionLoading}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {sv.orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Belum ada Surat Jalan ditugaskan ke armada ini.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>No. DO</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead className="text-right">Biaya Kirim</TableHead>
                        {isDRAFT && <TableHead className="text-right">Aksi</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sv.orders.map((so) => (
                        <TableRow key={so.id}>
                          <TableCell>
                            <Link
                              href={`/sales/deliveries`}
                              className="text-blue-600 hover:underline"
                            >
                              {so.deliveryOrder.orderNumber}
                            </Link>
                          </TableCell>
                          <TableCell>{so.deliveryOrder.salesOrder?.customer?.name || '-'}</TableCell>
                          <TableCell>{formatDate(so.deliveryOrder.deliveryDate)}</TableCell>
                          <TableCell className="text-right">
                            {so.deliveryOrder.totalCharge != null
                              ? formatRupiah(so.deliveryOrder.totalCharge)
                              : '-'}
                          </TableCell>
                          {isDRAFT && (
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveDO(so.id)}
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
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
