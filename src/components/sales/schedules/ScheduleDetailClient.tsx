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
import { ArrowLeft, Car, Trash2, CheckCircle, Package, Plus, Truck, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  updateDeliverySchedule,
  createScheduleTrip,
  updateTripStatus,
  removeVehicleFromSchedule,
  assignSalesOrderToTrip,
  assignOrderToSchedule,
  linkDeliveryOrderToStop,
  generateDeliveryOrderFromStop,
  generateDeliveryOrdersForTrip,
  removeOrderFromSchedule,
  listSchedulableSalesOrders,
} from '@/actions/sales/delivery-schedules';
import { getVehicles } from '@/actions/sales/vehicles';
import { getDeliveryOrders } from '@/actions/inventory/deliveries';

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
  PLANNED: 'Belum SJ', LINKED: 'Ada SJ', GENERATED: 'Ada SJ', CANCELLED: 'Batal',
};

const STOP_STATUS_STYLES: Record<string, string> = {
  PLANNED: 'bg-orange-100 text-orange-700', LINKED: 'bg-green-100 text-green-700',
  GENERATED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700',
};

// ============================================
// Helpers
// ============================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

function getWeekDayNames(weekStart: string): string[] {
  const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  return days;
}

function isSameDay(date1: string | null, date2: Date): boolean {
  if (!date1) return false;
  const d1 = new Date(date1);
  return d1.toDateString() === date2.toDateString();
}

// ============================================
// Interfaces
// ============================================

interface Vehicle {
  id: string;
  plateNumber: string;
  name: string;
  ownershipType: string;
  driverName?: string | null;
  capacityKg?: number | null;
  status: string;
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
    deliveryDate: string;
    totalCharge: number | null;
    status: string;
    salesOrder?: { orderNumber: string; customer?: { name: string } | null } | null;
  } | null;
  salesOrder?: {
    id: string;
    orderNumber: string;
    customer?: { name: string; address?: string | null } | null;
  } | null;
}

interface Trip {
  id: string;
  vehicleId: string;
  departureDate: string | null;
  routeName: string | null;
  status: string;
  notes: string | null;
  vehicle: { id: string; plateNumber: string; name: string; driverName: string | null; ownershipType: string; capacityKg?: number | null };
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
  expectedDate: string | null;
  remainingQty: number;
  alreadyPlanned: boolean;
  multiStop: boolean;
}

// ============================================
// Component
// ============================================

export function ScheduleDetailClient({ schedule }: { schedule: Schedule }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [schedulableSOs, setSchedulableSOs] = useState<SchedulableSO[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isAssignSOOpen, setIsAssignSOOpen] = useState(false);
  const [isGenerateDOOpen, setIsGenerateDOOpen] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [selectedSOId, setSelectedSOId] = useState('');
  const [plannedWeight, setPlannedWeight] = useState('');
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

  // ============================================
  // Handlers
  // ============================================

  const handleStatusChange = async (newStatus: string) => {
    setIsActionLoading(true);
    try {
      const result = await updateDeliverySchedule(schedule.id, { status: newStatus as any });
      if (!result.success) { toast.error(result.error || 'Gagal update status.'); return; }
      toast.success(`Status jadwal diubah ke "${STATUS_LABELS[newStatus] || newStatus}".`);
      router.refresh();
    } catch { toast.error('Gagal update status.'); } finally { setIsActionLoading(false); }
  };

  const handleCreateTrip = async () => {
    if (!selectedVehicleId || !departureDate) { toast.error('Pilih kendaraan dan tanggal berangkat.'); return; }
    setIsActionLoading(true);
    try {
      const result = await createScheduleTrip(schedule.id, { vehicleId: selectedVehicleId, departureDate: new Date(departureDate) });
      if (!result.success) { toast.error(result.error || 'Gagal membuat trip.'); return; }
      toast.success('Trip berhasil dibuat.');
      setSelectedVehicleId(''); setDepartureDate('');
      router.refresh();
    } catch { toast.error('Gagal membuat trip.'); } finally { setIsActionLoading(false); }
  };

  const handleTripStatus = async (tripId: string, newStatus: string) => {
    setIsActionLoading(true);
    try {
      const result = await updateTripStatus(tripId, newStatus as any);
      if (!result.success) { toast.error(result.error || 'Gagal update status trip.'); return; }
      toast.success(`Trip diubah ke "${TRIP_STATUS_LABELS[newStatus]}".`);
      router.refresh();
    } catch { toast.error('Gagal update status trip.'); } finally { setIsActionLoading(false); }
  };

  const handleRemoveTrip = async (tripId: string, plate: string) => {
    if (!window.confirm(`Yakin hapus trip "${plate}"? Semua stop akan dihapus.`)) return;
    setIsActionLoading(true);
    try {
      const result = await removeVehicleFromSchedule(tripId);
      if (!result.success) { toast.error(result.error || 'Gagal menghapus trip.'); return; }
      toast.success('Trip berhasil dihapus.'); router.refresh();
    } catch { toast.error('Gagal menghapus trip.'); } finally { setIsActionLoading(false); }
  };

  const handleAssignSO = async () => {
    if (!selectedTripId || !selectedSOId) { toast.error('Pilih trip dan Sales Order.'); return; }
    setIsActionLoading(true);
    try {
      const result = await assignSalesOrderToTrip(selectedTripId, {
        salesOrderId: selectedSOId,
        plannedWeightKg: plannedWeight ? parseFloat(plannedWeight) : undefined,
      });
      if (!result.success) { toast.error(result.error || 'Gagal assign SO.'); return; }
      toast.success('SO berhasil ditambahkan ke trip.');
      setIsAssignSOOpen(false); setSelectedTripId(''); setSelectedSOId(''); setPlannedWeight('');
      router.refresh();
    } catch { toast.error('Gagal assign SO.'); } finally { setIsActionLoading(false); }
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
      setIsGenerateDOOpen(false); router.refresh();
    } catch { toast.error('Gagal generate SJ.'); } finally { setIsActionLoading(false); }
  };

  const handleLinkDO = async (stopId: string, deliveryOrderId: string) => {
    setIsActionLoading(true);
    try {
      const result = await linkDeliveryOrderToStop(stopId, deliveryOrderId);
      if (!result.success) { toast.error(result.error || 'Gagal link SJ.'); return; }
      toast.success('SJ berhasil dilink.'); router.refresh();
    } catch { toast.error('Gagal link SJ.'); } finally { setIsActionLoading(false); }
  };

  const handleRemoveStop = async (stopId: string) => {
    if (!window.confirm('Yakin menghapus stop ini?')) return;
    setIsActionLoading(true);
    try {
      const result = await removeOrderFromSchedule(stopId);
      if (!result.success) { toast.error(result.error || 'Gagal menghapus stop.'); return; }
      toast.success('Stop berhasil dihapus.'); router.refresh();
    } catch { toast.error('Gagal menghapus stop.'); } finally { setIsActionLoading(false); }
  };

  // ============================================
  // Derived data
  // ============================================

  const isDRAFT = schedule.status === 'DRAFT';
  const isEditable = ['DRAFT', 'ACTIVE', 'CONFIRMED', 'IN_TRANSIT'].includes(schedule.status);

  const weekStart = new Date(schedule.weekStart);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });

  const trips = schedule.vehicles;
  const totalStops = trips.reduce((sum, t) => sum + t.orders.length, 0);
  const unlinkedStops = trips.reduce((sum, t) => sum + t.orders.filter(o => o.status === 'PLANNED').length, 0);
  const totalCharge = trips.reduce((sum, t) => sum + t.orders.reduce((s, o) => s + (o.deliveryOrder?.totalCharge || 0), 0), 0);

  const availableVehicles = vehicles.filter(v => !trips.some(t => t.vehicleId === v.id && t.status !== 'CANCELLED'));

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
          <p className="text-sm text-muted-foreground">Trip</p>
          <p className="text-2xl font-bold">{trips.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Total Stop</p>
          <p className="text-2xl font-bold">{totalStops}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Belum SJ</p>
          <p className={`text-2xl font-bold ${unlinkedStops > 0 ? 'text-orange-600' : ''}`}>{unlinkedStops}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Total Biaya Kirim</p>
          <p className="text-2xl font-bold">{formatRupiah(totalCharge)}</p>
        </CardContent></Card>
      </div>

      {/* Create Trip (only in DRAFT) */}
      {isDRAFT && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" /> Tambah Trip Baru
          </CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="space-y-1">
                <label className="text-sm font-medium">Kendaraan</label>
                <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
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
                <input type="date" value={departureDate} onChange={e => setDepartureDate(e.target.value)}
                  min={schedule.weekStart.split('T')[0]} max={schedule.weekEnd.split('T')[0]}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <Button onClick={handleCreateTrip} disabled={isActionLoading || !selectedVehicleId || !departureDate}>
                <Truck className="h-4 w-4 mr-2" /> Tambah Trip
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trip Cards */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Car className="h-5 w-5" /> Trip
        </h2>

        {trips.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">
            Belum ada trip. Tambah armada untuk mulai mengatur jadwal.
          </CardContent></Card>
        ) : (
          trips.map(trip => {
            const plannedKg = trip.orders.reduce((s, o) => s + (o.plannedWeightKg || 0), 0);
            const capacityKg = trip.vehicle.capacityKg ? Number(trip.vehicle.capacityKg) : null;
            const utilizationPct = capacityKg ? Math.round((plannedKg / capacityKg) * 100) : 0;
            const stopCount = trip.orders.length;
            const unlinked = trip.orders.filter(o => o.status === 'PLANNED').length;

            return (
              <Card key={trip.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Car className="h-4 w-4" />
                    {trip.vehicle.plateNumber}
                    <span className="text-muted-foreground font-normal">— {trip.vehicle.name}</span>
                    {trip.vehicle.driverName && <Badge variant="outline">{trip.vehicle.driverName}</Badge>}
                    <Badge className={TRIP_STATUS_STYLES[trip.status]}>{TRIP_STATUS_LABELS[trip.status]}</Badge>
                    {trip.departureDate && (
                      <span className="text-sm text-muted-foreground">📅 {formatDate(trip.departureDate)}</span>
                    )}
                    {trip.routeName && <span className="text-sm text-muted-foreground">🗺 {trip.routeName}</span>}
                  </CardTitle>
                  <div className="flex gap-1">
                    {/* Status actions */}
                    {trip.status === 'PLANNED' && (
                      <Button size="sm" variant="outline" onClick={() => handleTripStatus(trip.id, 'CONFIRMED')} disabled={isActionLoading}>Konfirmasi</Button>
                    )}
                    {trip.status === 'CONFIRMED' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleTripStatus(trip.id, 'DEPARTED')} disabled={isActionLoading || unlinked > 0}>Berangkat</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleTripStatus(trip.id, 'PLANNED')} disabled={isActionLoading}>Batal Konfirmasi</Button>
                      </>
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
                </CardHeader>
                <CardContent>
                  {/* Capacity bar */}
                  {capacityKg && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Kapasitas: {plannedKg.toLocaleString('id-ID')} / {capacityKg.toLocaleString('id-ID')} kg</span>
                        <span>{utilizationPct}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${utilizationPct > 100 ? 'bg-red-500' : utilizationPct > 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min(utilizationPct, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  {isEditable && trip.status !== 'DEPARTED' && trip.status !== 'COMPLETED' && trip.status !== 'CANCELLED' && (
                    <div className="flex gap-2 mb-3">
                      <Button size="sm" variant="outline" onClick={() => { setSelectedTripId(trip.id); setIsAssignSOOpen(true); }}>
                        <Plus className="h-3 w-3 mr-1" /> Tambah dari SO
                      </Button>
                      {unlinked === 0 && stopCount > 0 && (
                        <Button size="sm" variant="outline" onClick={() => handleGenerateDO(trip.id)} disabled={isActionLoading}>
                          <FileText className="h-3 w-3 mr-1" /> Buat Semua SJ
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Stops table */}
                  {trip.orders.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">Belum ada stop. Tambah dari SO atau Surat Jalan.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>SO</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead className="text-right">Berat Rencana</TableHead>
                          <TableHead>SJ</TableHead>
                          <TableHead>Status</TableHead>
                          {isEditable && <TableHead className="text-right">Aksi</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {trip.orders.map((stop, idx) => (
                          <TableRow key={stop.id}>
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell>{stop.salesOrder?.orderNumber || stop.deliveryOrder?.salesOrder?.orderNumber || '-'}</TableCell>
                            <TableCell>{stop.salesOrder?.customer?.name || stop.deliveryOrder?.salesOrder?.customer?.name || '-'}</TableCell>
                            <TableCell className="text-right">{stop.plannedWeightKg ? `${stop.plannedWeightKg.toLocaleString('id-ID')} kg` : '-'}</TableCell>
                            <TableCell>
                              {stop.deliveryOrder ? (
                                <Link href="/sales/deliveries" className="text-blue-600 hover:underline text-sm">{stop.deliveryOrder.orderNumber}</Link>
                              ) : (
                                <span className="text-orange-600 text-sm italic">Belum SJ</span>
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
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* ============================================ */}
      {/* Assign SO Dialog (simple inline) */}
      {/* ============================================ */}
      {isAssignSOOpen && (
        <Card className="border-blue-200">
          <CardHeader><CardTitle className="text-base">Tambah Sales Order ke Trip</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="space-y-1">
                <label className="text-sm font-medium">Trip</label>
                <Select value={selectedTripId} onValueChange={setSelectedTripId}>
                  <SelectTrigger><SelectValue placeholder="Pilih trip..." /></SelectTrigger>
                  <SelectContent>
                    {trips.filter(t => t.status === 'PLANNED' || t.status === 'CONFIRMED').map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.vehicle.plateNumber} — {t.departureDate ? formatDate(t.departureDate) : 'Tanpa tanggal'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Sales Order (sisa undelivered)</label>
                <Select value={selectedSOId} onValueChange={setSelectedSOId}>
                  <SelectTrigger><SelectValue placeholder="Pilih SO..." /></SelectTrigger>
                  <SelectContent>
                    {schedulableSOs.map(so => (
                      <SelectItem key={so.id} value={so.id}>
                        {so.orderNumber} — {so.customer?.name || 'N/A'}
                        {so.alreadyPlanned ? ' (sudah dijadwalkan)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Berat Rencana (kg, opsional)</label>
                <input type="number" value={plannedWeight} onChange={e => setPlannedWeight(e.target.value)}
                  placeholder="Contoh: 1200" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleAssignSO} disabled={isActionLoading || !selectedTripId || !selectedSOId}>
                <Plus className="h-4 w-4 mr-1" /> Tambahkan
              </Button>
              <Button variant="ghost" onClick={() => { setIsAssignSOOpen(false); setSelectedTripId(''); setSelectedSOId(''); }}>Batal</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Trip button for non-DRAFT */}
      {!isDRAFT && trips.length > 0 && (
        <div className="flex justify-center">
          <p className="text-sm text-muted-foreground">Trip baru hanya bisa ditambahkan saat status Draft.</p>
        </div>
      )}
    </div>
  );
}
