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
import { ArrowLeft, Car, Trash2, CheckCircle, Plus, Truck, FileText, Package } from 'lucide-react';
import { toast } from 'sonner';
import type { ScheduleStatus, TripStatus } from '@prisma/client';
import {
  updateDeliverySchedule,
  createScheduleTrip,
  updateTripStatus,
  removeVehicleFromSchedule,
  assignSalesOrderToTrip,
  generateDeliveryOrdersForTrip,
  removeOrderFromSchedule,
  listSchedulableSalesOrders,
} from '@/actions/sales/delivery-schedules';
import { getVehicles } from '@/actions/sales/vehicles';

// ============================================
// Status styling + labels
// ============================================

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800',
  ACTIVE: 'bg-blue-100 text-blue-800',
  CLOSED: 'bg-green-100 text-green-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  IN_TRANSIT: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', ACTIVE: 'Aktif', CLOSED: 'Selesai',
  CONFIRMED: 'Aktif', IN_TRANSIT: 'Aktif', COMPLETED: 'Selesai',
};

const TRIP_STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Direncanakan', CONFIRMED: 'Dikonfirmasi',
  DEPARTED: 'Berangkat', COMPLETED: 'Selesai', CANCELLED: 'Dibatalkan',
};

const TRIP_STATUS_STYLES: Record<string, string> = {
  PLANNED: 'bg-gray-100 text-gray-700', CONFIRMED: 'bg-blue-100 text-blue-700',
  DEPARTED: 'bg-amber-100 text-amber-700', COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const STOP_STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Belum diatur', LINKED: 'Terjadwal', GENERATED: 'Sudah SJ', CANCELLED: 'Batal',
};

const STOP_STATUS_STYLES: Record<string, string> = {
  PLANNED: 'bg-gray-100 text-gray-700', LINKED: 'bg-blue-100 text-blue-700',
  GENERATED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700',
};

// ============================================
// Helpers
// ============================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateWithDay(dateStr: string | null | Date): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const dayName = date.toLocaleDateString('id-ID', { weekday: 'long' });
  const formattedDate = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${dayName}, ${formattedDate}`;
}

// ============================================
// Interfaces
// ============================================

interface Vehicle {
  id: string;
  plateNumber: string;
  name: string;
  capacityKg?: number | null;
  driverName?: string | null;
  status: string;
}

interface StopItem {
  id: string;
  quantity: number;
  deliveredQty: number;
  enteredQuantity: number | null;
  enteredUnit: string | null;
  productVariant: {
    id: string;
    name: string;
    skuCode: string;
    primaryUnit: string;
  };
}

interface Stop {
  id: string;
  status: string;
  plannedWeightKg: number | null;
  sequence: number;
  notes: string | null;
  deliveryOrder: {
    id: string;
    orderNumber: string;
    totalCharge: number | null;
    status: string;
    salesOrder?: {
      id: string;
      orderNumber: string;
      customer?: { id: string; name: string } | null;
      items: StopItem[];
    } | null;
  } | null;
  salesOrder?: {
    id: string;
    orderNumber: string;
    customer?: { id: string; name: string } | null;
    items: StopItem[];
  } | null;
}

interface Trip {
  id: string;
  vehicleId: string;
  departureDate: string | null;
  routeName: string | null;
  status: string;
  vehicle: { id: string; plateNumber: string; name: string; driverName: string | null; capacityKg?: number | null };
  orders: Stop[];
}

interface Schedule {
  id: string;
  scheduleNumber: string;
  weekStart: string;
  weekEnd: string;
  status: string;
  notes: string | null;
  vehicles: Trip[];
  createdBy: { name: string | null } | null;
}

interface SchedulableSO {
  id: string;
  orderNumber: string;
  customer: { id: string; name: string } | null;
  remainingQty: number;
  alreadyPlanned: boolean;
  items: StopItem[];
}

// ============================================
// Component
// ============================================

export function ScheduleDetailClient({ schedule }: { schedule: Schedule }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [schedulableSOs, setSchedulableSOs] = useState<SchedulableSO[]>([]);
  const [selectedSOId, setSelectedSOId] = useState('');
  const [selectedTripId, setSelectedTripId] = useState('');
  const [plannedWeight, setPlannedWeight] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [showAddSO, setShowAddSO] = useState(false);
  const [showCreateTrip, setShowCreateTrip] = useState(false);
  const [newTripVehicleId, setNewTripVehicleId] = useState('');
  const [newTripDate, setNewTripDate] = useState('');
  const [assignTripStopId, setAssignTripStopId] = useState('');
  const [assignTripId, setAssignTripId] = useState('');
  const router = useRouter();

  const loadData = useCallback(async () => {
    const [vehiclesRes, soRes] = await Promise.all([
      getVehicles({ status: 'ACTIVE' }),
      listSchedulableSalesOrders({ scheduleId: schedule.id }),
    ]);
    if (vehiclesRes.success && vehiclesRes.data) setVehicles(vehiclesRes.data as Vehicle[]);
    if (soRes.success && soRes.data) setSchedulableSOs(soRes.data as SchedulableSO[]);
  }, [schedule]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (selectedSOId) {
      const so = schedulableSOs.find(s => s.id === selectedSOId);
      if (so) {
        const totalRemaining = so.items.reduce((sum, item) => {
          const rem = Number(item.quantity) - Number(item.deliveredQty);
          return sum + (rem > 0 ? rem : 0);
        }, 0);
        setPlannedWeight(totalRemaining > 0 ? Math.round(totalRemaining).toString() : '');
      }
    } else {
      setPlannedWeight('');
    }
  }, [selectedSOId, schedulableSOs]);

  // ============================================
  // All stops flattened from trips
  // ============================================

  const allStops: (Stop & { tripId?: string; tripPlate?: string; tripDate?: string | null })[] = [];
  const trips = schedule.vehicles;
  trips.forEach(t => {
    t.orders.forEach(o => {
      allStops.push({ ...o, tripId: t.id, tripPlate: t.vehicle.plateNumber, tripDate: t.departureDate });
    });
  });

  // ============================================
  // Handlers
  // ============================================

  const handleStatusChange = async (newStatus: string) => {
    setIsActionLoading(true);
    try {
      const result = await updateDeliverySchedule(schedule.id, { status: newStatus as ScheduleStatus });
      if (!result.success) { toast.error(result.error || 'Gagal update status.'); return; }
      toast.success(`Status diubah ke "${STATUS_LABELS[newStatus]}".`);
      router.refresh();
    } catch { toast.error('Gagal update status.'); } finally { setIsActionLoading(false); }
  };

  const handleAddSO = async () => {
    if (!selectedSOId) { toast.error('Pilih Sales Order.'); return; }
    if (!selectedTripId) { toast.error('Pilih Trip / Hari Kirim.'); return; }
    setIsActionLoading(true);
    try {
      const result = await assignSalesOrderToTrip(selectedTripId, {
        salesOrderId: selectedSOId,
        plannedWeightKg: plannedWeight ? parseFloat(plannedWeight) : undefined,
      });
      if (!result.success) { toast.error(result.error || 'Gagal menambah SO.'); return; }
      toast.success('SO berhasil ditambahkan.');
      setShowAddSO(false); setSelectedSOId(''); setSelectedTripId(''); setPlannedWeight('');
      router.refresh();
    } catch { toast.error('Gagal menambah SO.'); } finally { setIsActionLoading(false); }
  };

  const handleCreateTrip = async () => {
    if (!newTripVehicleId || !newTripDate) { toast.error('Pilih kendaraan dan tanggal.'); return; }
    setIsActionLoading(true);
    try {
      const result = await createScheduleTrip(schedule.id, {
        vehicleId: newTripVehicleId,
        departureDate: new Date(newTripDate),
      });
      if (!result.success) { toast.error(result.error || 'Gagal membuat trip.'); return; }
      toast.success('Trip berhasil dibuat.');
      setShowCreateTrip(false); setNewTripVehicleId(''); setNewTripDate('');
      router.refresh();
    } catch { toast.error('Gagal membuat trip.'); } finally { setIsActionLoading(false); }
  };

  const handleAssignToTrip = async (stopId: string, tripId: string) => {
    setIsActionLoading(true);
    try {
      const stop = allStops.find(s => s.id === stopId);
      if (!stop?.salesOrder) { toast.error('Stop tidak punya SO.'); return; }
      const result = await assignSalesOrderToTrip(tripId, {
        salesOrderId: stop.salesOrder.id,
        plannedWeightKg: stop.plannedWeightKg ?? undefined,
      });
      if (!result.success) { toast.error(result.error || 'Gagal assign ke trip.'); return; }
      toast.success('Berhasil dipindahkan ke trip.');
      setAssignTripStopId(''); setAssignTripId('');
      router.refresh();
    } catch { toast.error('Gagal assign ke trip.'); } finally { setIsActionLoading(false); }
  };

  const handleTripStatus = async (tripId: string, newStatus: string) => {
    setIsActionLoading(true);
    try {
      const result = await updateTripStatus(tripId, newStatus as TripStatus);
      if (!result.success) { toast.error(result.error || 'Gagal update status trip.'); return; }
      toast.success(`Trip diubah ke "${TRIP_STATUS_LABELS[newStatus]}".`);
      router.refresh();
    } catch { toast.error('Gagal update status trip.'); } finally { setIsActionLoading(false); }
  };

  const handleRemoveTrip = async (tripId: string, plate: string) => {
    if (!window.confirm(`Yakin hapus trip "${plate}"? Stop akan dikembalikan ke "Belum diatur".`)) return;
    setIsActionLoading(true);
    try {
      const result = await removeVehicleFromSchedule(tripId);
      if (!result.success) { toast.error(result.error || 'Gagal menghapus trip.'); return; }
      toast.success('Trip berhasil dihapus.'); router.refresh();
    } catch { toast.error('Gagal menghapus trip.'); } finally { setIsActionLoading(false); }
  };

  const handleGenerateDO = async (tripId: string) => {
    setIsActionLoading(true);
    try {
      const result = await generateDeliveryOrdersForTrip(tripId);
      if (!result.success) { toast.error(result.error || 'Gagal generate SJ.'); return; }
      const data = result.data as { ok: string[]; failed: { stopId: string; error: string }[] };
      if (data.failed.length === 0) {
        toast.success(`${data.ok.length} Surat Jalan berhasil dibuat.`);
      } else {
        toast.warning(`${data.ok.length} SJ dibuat, ${data.failed.length} gagal.`);
      }
      router.refresh();
    } catch { toast.error('Gagal generate SJ.'); } finally { setIsActionLoading(false); }
  };

  const handleRemoveStop = async (stopId: string) => {
    if (!window.confirm('Yakin menghapus SO dari rencana?')) return;
    setIsActionLoading(true);
    try {
      const result = await removeOrderFromSchedule(stopId);
      if (!result.success) { toast.error(result.error || 'Gagal menghapus.'); return; }
      toast.success('Berhasil dihapus.'); router.refresh();
    } catch { toast.error('Gagal menghapus.'); } finally { setIsActionLoading(false); }
  };

  // ============================================
  // Derived
  // ============================================

  const isDRAFT = schedule.status === 'DRAFT';
  const isEditable = ['DRAFT', 'ACTIVE', 'CONFIRMED', 'IN_TRANSIT'].includes(schedule.status);

  const totalPlannedKg = allStops.reduce((s, o) => s + (o.plannedWeightKg || 0), 0);
  const unlinkedCount = allStops.filter(o => !o.deliveryOrder).length;

  const availableVehicles = vehicles;

  // ============================================
  // Render
  // ============================================

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/sales/delivery-schedules">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Kembali</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            {schedule.scheduleNumber}
            <Badge className={STATUS_STYLES[schedule.status] || ''}>{STATUS_LABELS[schedule.status]}</Badge>
          </h1>
          <p className="text-muted-foreground">{formatDate(schedule.weekStart)} — {formatDate(schedule.weekEnd)}</p>
        </div>
        {isDRAFT && (
          <Button onClick={() => handleStatusChange('ACTIVE')} disabled={isActionLoading}>
            <CheckCircle className="h-4 w-4 mr-2" /> Aktifkan
          </Button>
        )}
        {isEditable && !isDRAFT && (
          <Button onClick={() => handleStatusChange('CLOSED')} disabled={isActionLoading}>
            <CheckCircle className="h-4 w-4 mr-2" /> Tutup Minggu
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">SO Dijadwalkan</p>
          <p className="text-2xl font-bold">{allStops.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Total Berat Rencana</p>
          <p className="text-2xl font-bold">{totalPlannedKg.toLocaleString('id-ID')} kg</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Belum ada SJ</p>
          <p className={`text-2xl font-bold ${unlinkedCount > 0 ? 'text-orange-600' : ''}`}>{unlinkedCount}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Trip</p>
          <p className="text-2xl font-bold">{trips.length}</p>
        </CardContent></Card>
      </div>

      {/* ============================================ */}
      {/* SECTION 1: RENCANA KIRIM — SO yang mau dikirim */}
      {/* ============================================ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" /> Rencana Kirim Minggu Ini
          </CardTitle>
          {isEditable && (
            <Button size="sm" onClick={() => setShowAddSO(!showAddSO)}>
              <Plus className="h-3 w-3 mr-1" /> Tambah SO
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {/* Add SO form */}
          {showAddSO && (
            <div className="mb-4 p-4 border rounded-lg bg-muted/30 space-y-4">
              {/* Row 1: Sales Order */}
              <div className="space-y-1.5 w-full">
                <label className="text-sm font-medium text-muted-foreground">Sales Order</label>
                <Select value={selectedSOId} onValueChange={setSelectedSOId}>
                  <SelectTrigger className="w-full h-10">
                    <SelectValue placeholder="Pilih SO (sisa qty > 0)..." />
                  </SelectTrigger>
                  <SelectContent>
                    {schedulableSOs.map(so => (
                      <SelectItem key={so.id} value={so.id}>
                        {so.orderNumber} — {so.customer?.name || 'N/A'}
                        {so.alreadyPlanned ? ' ⚠️ sudah dijadwalkan' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Row 2: Trip / Hari Kirim, Berat Rencana, Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="space-y-1.5 md:col-span-6">
                  <label className="text-sm font-medium text-muted-foreground">Trip / Hari Kirim</label>
                  <Select value={selectedTripId} onValueChange={setSelectedTripId}>
                    <SelectTrigger className="w-full h-10">
                      <SelectValue placeholder="Pilih trip & hari..." />
                    </SelectTrigger>
                    <SelectContent>
                      {trips.filter(t => t.status === 'PLANNED' || t.status === 'CONFIRMED').map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.vehicle.plateNumber} — {formatDateWithDay(t.departureDate)}
                        </SelectItem>
                      ))}
                      {trips.filter(t => t.status === 'PLANNED' || t.status === 'CONFIRMED').length === 0 && (
                        <SelectItem value="_empty" disabled>Buat trip terlebih dahulu...</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-3">
                  <label className="text-sm font-medium text-muted-foreground">Berat Rencana (kg, opsional)</label>
                  <input
                    type="number"
                    value={plannedWeight}
                    onChange={e => setPlannedWeight(e.target.value)}
                    placeholder="Contoh: 1200"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="flex gap-2 md:col-span-3 h-10 items-center justify-end">
                  <Button
                    onClick={handleAddSO}
                    disabled={isActionLoading || !selectedSOId || !selectedTripId}
                    className="h-10 px-4"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Tambah
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => { setShowAddSO(false); setSelectedSOId(''); setSelectedTripId(''); }}
                    className="h-10 px-4"
                  >
                    Batal
                  </Button>
                </div>
              </div>
              {selectedSOId && (() => {
                const so = schedulableSOs.find(s => s.id === selectedSOId);
                if (!so) return null;
                return (
                  <div className="p-3 bg-muted/50 rounded-md border border-border/50 text-xs">
                    <p className="font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" /> Detail Barang & Sisa Qty di SO:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {so.items.map((item) => {
                        const rem = Number(item.quantity) - Number(item.deliveredQty);
                        return (
                          <div key={item.id} className="flex justify-between border-b border-border/30 pb-1">
                            <span className="font-medium text-foreground">{item.productVariant.name}</span>
                            <span className="text-muted-foreground">
                              {rem.toLocaleString('id-ID')} / {Number(item.quantity).toLocaleString('id-ID')} {item.productVariant.primaryUnit}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              <p className="text-xs text-muted-foreground">
                SO yang ditambahkan akan masuk rencana minggu ini. Selanjutnya tentukan truk & tanggal di section Trip.
              </p>
            </div>
          )}

          {/* Stops table */}
          {allStops.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Belum ada SO yang dijadwalkan. Klik Tambah SO untuk memulai.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>No. SO</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Berat Rencana</TableHead>
                  <TableHead>Surat Jalan</TableHead>
                  <TableHead>Trip</TableHead>
                  <TableHead>Status</TableHead>
                  {isEditable && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {allStops.map((stop, idx) => (
                  <TableRow key={stop.id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">
                      <div>{stop.salesOrder?.orderNumber || stop.deliveryOrder?.orderNumber || '-'}</div>
                      {(() => {
                        const items = stop.salesOrder?.items || stop.deliveryOrder?.salesOrder?.items;
                        if (!items || items.length === 0) return null;
                        return (
                          <div className="text-[10px] text-muted-foreground font-normal mt-1 leading-tight space-y-0.5 max-w-[200px]">
                            {items.map((item) => {
                              const rem = Number(item.quantity) - Number(item.deliveredQty);
                              return (
                                <div key={item.id} className="truncate" title={`${item.productVariant.name} (${rem.toLocaleString('id-ID')} ${item.productVariant.primaryUnit} sisa)`}>
                                  • {item.productVariant.name} ({rem.toLocaleString('id-ID')} {item.productVariant.primaryUnit} sisa)
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>{stop.salesOrder?.customer?.name || stop.deliveryOrder?.salesOrder?.customer?.name || '-'}</TableCell>
                    <TableCell className="text-right">{stop.plannedWeightKg ? `${stop.plannedWeightKg.toLocaleString('id-ID')} kg` : '-'}</TableCell>
                    <TableCell>
                      {stop.deliveryOrder ? (
                        <Link href="/sales/deliveries" className="text-blue-600 hover:underline text-sm">{stop.deliveryOrder.orderNumber}</Link>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {stop.tripId ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">{stop.tripPlate}</Badge>
                          </div>
                          {stop.tripDate && <span className="text-[10px] text-muted-foreground">{formatDateWithDay(stop.tripDate)}</span>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-orange-600 italic">Belum diatur</span>
                          {isEditable && trips.length > 0 && (
                            <Select value={assignTripStopId === stop.id ? assignTripId : ''} onValueChange={(v) => { setAssignTripStopId(stop.id); setAssignTripId(v); handleAssignToTrip(stop.id, v); }}>
                              <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue placeholder="Atur Trip..." /></SelectTrigger>
                              <SelectContent>
                                {trips.filter(t => t.status === 'PLANNED' || t.status === 'CONFIRMED').map(t => (
                                  <SelectItem key={t.id} value={t.id}>
                                    {t.vehicle.plateNumber} ({formatDateWithDay(t.departureDate)})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell><Badge className={STOP_STATUS_STYLES[stop.status]}>{STOP_STATUS_LABELS[stop.status]}</Badge></TableCell>
                    {isEditable && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveStop(stop.id)} disabled={isActionLoading}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <p className="text-xs text-muted-foreground mt-3">
            Estimasi plan &mdash; tagihan ongkir dari Surat Jalan, bukan dari rencana ini.
          </p>
        </CardContent>
      </Card>

      {/* ============================================ */}
      {/* SECTION 2: TRIP — Armada + Jadwal Kirim */}
      {/* ============================================ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" /> Trip / Armada
          </CardTitle>
          {isEditable && (
            <Button size="sm" onClick={() => setShowCreateTrip(!showCreateTrip)}>
              <Plus className="h-3 w-3 mr-1" /> Tambah Trip
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {/* Create trip form */}
          {showCreateTrip && (
            <div className="mb-4 p-4 border rounded-lg bg-muted/30">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Kendaraan</label>
                  <Select value={newTripVehicleId} onValueChange={setNewTripVehicleId}>
                    <SelectTrigger><SelectValue placeholder="Pilih kendaraan..." /></SelectTrigger>
                    <SelectContent>
                      {availableVehicles.map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.plateNumber} — {v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Tanggal Berangkat</label>
                  <input type="date" value={newTripDate} onChange={e => setNewTripDate(e.target.value)}
                    min={schedule.weekStart.split('T')[0]} max={schedule.weekEnd.split('T')[0]}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                  {newTripDate && (
                    <span className="text-xs text-muted-foreground block mt-1">
                      📅 {formatDateWithDay(newTripDate)}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreateTrip} disabled={isActionLoading || !newTripVehicleId || !newTripDate}>
                    <Truck className="h-3 w-3 mr-1" /> Buat Trip
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setShowCreateTrip(false); setNewTripVehicleId(''); }}>Batal</Button>
                </div>
              </div>
            </div>
          )}

          {trips.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Belum ada trip. Buat trip untuk menentukan armada & tanggal kirim.
            </div>
          ) : (
            <div className="space-y-3">
              {trips.map(trip => {
                const plannedKg = trip.orders.reduce((s, o) => s + (o.plannedWeightKg || 0), 0);
                const capacityKg = trip.vehicle.capacityKg ? Number(trip.vehicle.capacityKg) : null;
                const utilizationPct = capacityKg ? Math.round((plannedKg / capacityKg) * 100) : 0;
                const unlinkedInTrip = trip.orders.filter(o => !o.deliveryOrder).length;

                return (
                  <div key={trip.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Car className="h-4 w-4" />
                        <span className="font-medium">{trip.vehicle.plateNumber}</span>
                        <span className="text-muted-foreground">— {trip.vehicle.name}</span>
                        {trip.vehicle.driverName && <Badge variant="outline">{trip.vehicle.driverName}</Badge>}
                        <Badge className={TRIP_STATUS_STYLES[trip.status]}>{TRIP_STATUS_LABELS[trip.status]}</Badge>
                        {trip.departureDate && <span className="text-sm text-muted-foreground">📅 {formatDateWithDay(trip.departureDate)}</span>}
                        {trip.routeName && <span className="text-sm text-muted-foreground">🗺 {trip.routeName}</span>}
                      </div>
                      <div className="flex gap-1 items-center">
                        {trip.status === 'PLANNED' && (
                          <Button size="sm" variant="outline" onClick={() => handleTripStatus(trip.id, 'CONFIRMED')} disabled={isActionLoading}>Konfirmasi</Button>
                        )}
                        {trip.status === 'CONFIRMED' && unlinkedInTrip === 0 && (
                          <Button size="sm" variant="outline" onClick={() => handleTripStatus(trip.id, 'DEPARTED')} disabled={isActionLoading}>Berangkat</Button>
                        )}
                        {trip.status === 'CONFIRMED' && (
                          <Button size="sm" variant="ghost" onClick={() => handleTripStatus(trip.id, 'PLANNED')} disabled={isActionLoading}>Batal</Button>
                        )}
                        {trip.status === 'DEPARTED' && (
                          <Button size="sm" variant="outline" onClick={() => handleTripStatus(trip.id, 'COMPLETED')} disabled={isActionLoading}>Selesai</Button>
                        )}
                        {isDRAFT && (trip.status === 'PLANNED' || trip.status === 'CANCELLED') && (
                          <Button size="sm" variant="ghost" onClick={() => handleRemoveTrip(trip.id, trip.vehicle.plateNumber)} disabled={isActionLoading}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Capacity bar */}
                    {capacityKg && (
                      <div className="mb-2">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Kapasitas: {plannedKg.toLocaleString('id-ID')} / {capacityKg.toLocaleString('id-ID')} kg</span>
                          <span>{utilizationPct}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${utilizationPct > 100 ? 'bg-red-500' : utilizationPct > 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min(utilizationPct, 100)}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Stops in this trip */}
                    {trip.orders.length > 0 ? (
                      <div className="text-sm space-y-1">
                        {trip.orders.map(o => (
                          <div key={o.id} className="flex items-center justify-between text-muted-foreground">
                            <span>{o.salesOrder?.orderNumber || o.deliveryOrder?.orderNumber || '-'}</span>
                            <span>{o.plannedWeightKg ? `${o.plannedWeightKg.toLocaleString('id-ID')} kg` : ''}</span>
                          </div>
                        ))}
                        {unlinkedInTrip > 0 && (
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" variant="outline" onClick={() => handleGenerateDO(trip.id)} disabled={isActionLoading}>
                              <FileText className="h-3 w-3 mr-1" /> Buat Semua SJ ({unlinkedInTrip})
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Trip kosong — assign SO dari section atas.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
