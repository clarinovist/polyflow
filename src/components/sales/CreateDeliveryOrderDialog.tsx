'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Truck, Car } from 'lucide-react';
import { toast } from 'sonner';
import { createManualDeliveryOrder } from '@/actions/inventory/deliveries';
import { getSalesOrders, getSalesOrderById } from '@/actions/sales/sales';
import { getLocations } from '@/actions/inventory/inventory';
import { getVehicles } from '@/actions/sales/vehicles';
import { getActiveTariff as fetchActiveTariff, listVehicleRouteOptions as fetchRouteOptions } from '@/actions/sales/vehicle-tariffs';
import { useRouter } from 'next/navigation';
import { salesLabels } from '@/lib/labels';

interface SalesOrder {
  id: string;
  orderNumber: string;
  customer?: {
    name: string;
    shippingAddress?: string | null;
    billingAddress?: string | null;
    defaultVehicleId?: string | null;
  } | null;
  items?: Array<{
    id: string;
    quantity: string | number;
    enteredQuantity?: string | number | null;
    enteredUnit?: string | null;
    productVariant?: {
      name: string;
      primaryUnit: string;
      salesUnit?: string | null;
      product?: { name: string } | null;
    } | null;
  }>;
}

interface Location {
  id: string;
  name: string;
}

interface Vehicle {
  id: string;
  plateNumber: string;
  name: string;
  ownershipType: string;
  driverName?: string | null;
}

interface ActiveTariff {
  rateType: string;
  costRate: { toNumber: () => number };
  chargeRate: { toNumber: () => number };
  routeName?: string | null;
  minKg?: { toNumber: () => number } | null;
}

export function CreateDeliveryOrderDialog({
  defaultSalesOrderId,
  triggerLabel,
  triggerVariant = 'default',
  triggerClassName,
}: {
  defaultSalesOrderId?: string;
  /** Override trigger button label (default: Buat Surat Jalan Manual) */
  triggerLabel?: string;
  triggerVariant?: 'default' | 'outline' | 'secondary' | 'ghost';
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedSalesOrderId, setSelectedSalesOrderId] = useState(defaultSalesOrderId || '');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [estimatedWeightKg, setEstimatedWeightKg] = useState('');
  const [selectedSoDetail, setSelectedSoDetail] = useState<SalesOrder | null>(null);
  const [isLoadingSoDetail, setIsLoadingSoDetail] = useState(false);
  const [destinationAddress, setDestinationAddress] = useState('');
  // Route fields
  const [selectedRouteName, setSelectedRouteName] = useState('');
  const [routeOptions, setRouteOptions] = useState<string[]>([]);
  // Tariff fields
  const [tariffRateType, setTariffRateType] = useState('');
  const [overrideCostRate, setOverrideCostRate] = useState('');
  const [overrideChargeRate, setOverrideChargeRate] = useState('');
  const router = useRouter();

  // PER_KG calculation: weight × rate = total
  const { suggestedCharge, suggestedCost } = useMemo(() => {
    if (tariffRateType !== 'PER_KG') return { suggestedCharge: null, suggestedCost: null };
    const weight = parseFloat(estimatedWeightKg);
    const chargeRate = parseFloat(overrideChargeRate);
    const costRate = parseFloat(overrideCostRate);
    if (!weight || weight <= 0) return { suggestedCharge: null, suggestedCost: null };
    return {
      suggestedCharge: chargeRate > 0 ? weight * chargeRate : null,
      suggestedCost: costRate > 0 ? weight * costRate : null,
    };
  }, [tariffRateType, estimatedWeightKg, overrideChargeRate, overrideCostRate]);

  const loadData = useCallback(async () => {
    const [ordersRes, locationsRes, vehiclesRes] = await Promise.all([
      getSalesOrders(false, undefined, 'customer', {
        statusFilter: ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP'],
      }),
      getLocations(),
      getVehicles({ status: 'ACTIVE' }),
    ]);
    if (ordersRes.success && ordersRes.data) setSalesOrders(ordersRes.data as SalesOrder[]);
    if (locationsRes.success && locationsRes.data) setLocations(locationsRes.data as Location[]);
    if (vehiclesRes.success && vehiclesRes.data) setVehicles(vehiclesRes.data as Vehicle[]);
  }, []);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  const handleSalesOrderChange = async (soId: string) => {
    setSelectedSalesOrderId(soId);
    setSelectedSoDetail(null);
    if (!soId) return;

    // Fetch full SO detail to get items + quantities
    setIsLoadingSoDetail(true);
    try {
      const res = await getSalesOrderById(soId);
      if (res.success && res.data) {
        const so = res.data as SalesOrder;
        setSelectedSoDetail(so);

        // Auto-fill destination address from customer (always override on SO change)
        const addr = so.customer?.shippingAddress || so.customer?.billingAddress || '';
        setDestinationAddress(addr);

        // Auto-calculate estimated weight = sum of item quantities
        if (so.items && so.items.length > 0) {
          const totalQty = so.items.reduce((sum, item) => {
            const qty = parseFloat(String(item.enteredQuantity ?? item.quantity ?? 0));
            return sum + (isNaN(qty) ? 0 : qty);
          }, 0);
          if (totalQty > 0) setEstimatedWeightKg(String(totalQty));
        }

        // Auto-select default vehicle from customer
        if (so.customer?.defaultVehicleId && !selectedVehicleId) {
          handleVehicleChange(so.customer.defaultVehicleId);
        }
      }
    } finally {
      setIsLoadingSoDetail(false);
    }
  };

  const handleVehicleChange = async (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    setSelectedRouteName('');
    if (!vehicleId) {
      setTariffRateType('');
      setOverrideCostRate('');
      setOverrideChargeRate('');
      setRouteOptions([]);
      return;
    }
    // Load route options for this vehicle
    const routesRes = await fetchRouteOptions(vehicleId);
    const routes = (routesRes.success && routesRes.data) ? routesRes.data as string[] : [];
    setRouteOptions(routes);

    // Load active tariff (default: Semua Rute)
    await loadTariffForRoute(vehicleId, '');
  };

  const loadTariffForRoute = async (vehicleId: string, routeName: string) => {
    const tariffRes = await fetchActiveTariff(vehicleId, routeName || undefined);
    if (tariffRes.success && tariffRes.data) {
      const t = tariffRes.data as ActiveTariff;
      setTariffRateType(t.rateType);
      setOverrideCostRate(String(Number(t.costRate)));
      setOverrideChargeRate(String(Number(t.chargeRate)));
    } else {
      setTariffRateType('');
      setOverrideCostRate('');
      setOverrideChargeRate('');
    }
  };

  const handleRouteChange = async (routeName: string) => {
    const resolved = routeName === '__all__' ? '' : routeName;
    setSelectedRouteName(resolved);
    if (selectedVehicleId) {
      await loadTariffForRoute(selectedVehicleId, resolved);
    }
  };

  const resetForm = () => {
    setSelectedSalesOrderId(defaultSalesOrderId || '');
    setSelectedSoDetail(null);
    setSelectedLocationId('');
    setSelectedVehicleId('');
    setCarrier('');
    setTrackingNumber('');
    setNotes('');
    setTariffRateType('');
    setOverrideCostRate('');
    setOverrideChargeRate('');
    setEstimatedWeightKg('');
    setDestinationAddress('');
    setSelectedRouteName('');
    setRouteOptions([]);
  };

  const handleSubmit = async () => {
    if (!selectedSalesOrderId) {
      toast.error('Pilih Sales Order terlebih dahulu');
      return;
    }
    if (!selectedLocationId) {
      toast.error('Pilih lokasi gudang terlebih dahulu');
      return;
    }

    setIsLoading(true);
    try {
      const result = await createManualDeliveryOrder({
        salesOrderId: selectedSalesOrderId,
        sourceLocationId: selectedLocationId,
        carrier: carrier || undefined,
        trackingNumber: trackingNumber || undefined,
        notes: notes || undefined,
        vehicleId: selectedVehicleId || undefined,
        appliedRateType: tariffRateType || undefined,
        appliedCostRate: overrideCostRate ? parseFloat(overrideCostRate) : undefined,
        appliedChargeRate: overrideChargeRate ? parseFloat(overrideChargeRate) : undefined,
        appliedRouteName: selectedRouteName || undefined,
        totalCost: suggestedCost ?? (overrideCostRate ? parseFloat(overrideCostRate) : undefined),
        totalCharge: suggestedCharge ?? (overrideChargeRate ? parseFloat(overrideChargeRate) : undefined),
        estimatedWeightKg: estimatedWeightKg ? parseFloat(estimatedWeightKg) : undefined,
        destinationAddress: destinationAddress || undefined,
      });

      if (!result.success) {
        toast.error(result.error || 'Gagal membuat Surat Jalan');
        return;
      }

      toast.success('Surat Jalan berhasil dibuat');
      setOpen(false);
      resetForm();
      router.refresh();
    } catch {
      toast.error('Gagal membuat surat jalan. Silakan coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  const buttonLabel = triggerLabel ?? (defaultSalesOrderId ? salesLabels.buatSuratJalan : 'Buat Surat Jalan Manual');

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} className={triggerClassName ?? 'shadow-sm'}>
          <Plus className="mr-2 h-4 w-4" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-purple-600" />
            {salesLabels.buatSuratJalan}
          </DialogTitle>
          <DialogDescription>
            {salesLabels.sjPendingHint}. Boleh dibuat saat stok FG belum lengkap; stok baru dipotong saat Tandai Dikirim.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Sales Order *</Label>
            <Select value={selectedSalesOrderId} onValueChange={handleSalesOrderChange}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih Sales Order..." />
              </SelectTrigger>
              <SelectContent>
                {salesOrders.map((so) => (
                  <SelectItem key={so.id} value={so.id}>
                    {so.orderNumber} — {so.customer?.name || 'N/A'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* SO Items Summary Card */}
          {isLoadingSoDetail && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-3 w-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              Memuat detail SO...
            </div>
          )}
          {!isLoadingSoDetail && selectedSoDetail?.items && selectedSoDetail.items.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Item dalam SO</p>
              <div className="space-y-1">
                {selectedSoDetail.items.map((item) => {
                  const qty = parseFloat(String(item.enteredQuantity ?? item.quantity ?? 0));
                  const unit = item.enteredUnit || item.productVariant?.salesUnit || item.productVariant?.primaryUnit || '';
                  const productName = item.productVariant?.product?.name || item.productVariant?.name || '';
                  return (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-foreground">{productName}</span>
                      <span className="font-medium text-foreground tabular-nums">
                        {isNaN(qty) ? '-' : qty.toLocaleString('id-ID')} {unit}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="border-t pt-1 flex justify-between text-sm font-semibold">
                <span>Total estimasi berat</span>
                <span className="tabular-nums">
                  {selectedSoDetail.items.reduce((sum, item) => {
                    const qty = parseFloat(String(item.enteredQuantity ?? item.quantity ?? 0));
                    return sum + (isNaN(qty) ? 0 : qty);
                  }, 0).toLocaleString('id-ID')} kg
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Lokasi Gudang *</Label>
            <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih gudang asal..." />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Car className="h-4 w-4" />
              Armada / Kendaraan
            </Label>
            <Select value={selectedVehicleId} onValueChange={handleVehicleChange}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih kendaraan (opsional)..." />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.plateNumber} — {v.name}
                    {v.driverName ? ` (${v.driverName})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedVehicleId && (
            <div className="space-y-2">
              <Label>Rute Pengiriman</Label>
              <Select value={selectedRouteName} onValueChange={handleRouteChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua Rute" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Rute</SelectItem>
                  {routeOptions.map((route) => (
                    <SelectItem key={route} value={route}>
                      {route}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Tarif boleh berbeda per rute. Kosongkan untuk &quot;Semua Rute&quot;.
              </p>
            </div>
          )}

          {tariffRateType && (
            <div className="p-3 bg-muted/50 rounded-lg border space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                Tarif: {tariffRateType === 'PER_KG' ? 'Per Kg' : 'Flat Rate'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Biaya Operasional (override)</Label>
                  <Input
                    type="number"
                    value={overrideCostRate}
                    onChange={(e) => setOverrideCostRate(e.target.value)}
                    placeholder="Rp"
                    min={0}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Biaya Customer (override)</Label>
                  <Input
                    type="number"
                    value={overrideChargeRate}
                    onChange={(e) => setOverrideChargeRate(e.target.value)}
                    placeholder="Rp"
                    min={0}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Kurir / Ekspedisi</Label>
              <Input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="Contoh: JNE, J&T"
              />
            </div>
            <div className="space-y-2">
              <Label>No. Resi / AWB</Label>
              <Input
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Opsional"
              />
            </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Estimasi Berat (Kg)</Label>
              <Input
                type="number"
                value={estimatedWeightKg}
                onChange={(e) => setEstimatedWeightKg(e.target.value)}
                placeholder="Opsional"
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label>Alamat Tujuan</Label>
              <Input
                value={destinationAddress}
                onChange={(e) => setDestinationAddress(e.target.value)}
                placeholder="Opsional (default: alamat customer)"
              />
            </div>
            </div>

            {tariffRateType === 'PER_KG' && (suggestedCharge != null || suggestedCost != null) && (
              <div className="text-xs rounded-md border bg-muted/40 px-3 py-2 space-y-0.5 text-muted-foreground">
                {suggestedCost != null && (
                  <p>
                    Est. biaya oper.:{' '}
                    <span className="font-medium text-foreground">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(suggestedCost)}
                    </span>
                    {' '}({estimatedWeightKg} kg × Rp {Number(overrideCostRate).toLocaleString('id-ID')})
                  </p>
                )}
                {suggestedCharge != null && (
                  <p>
                    Est. charge customer:{' '}
                    <span className="font-medium text-foreground">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(suggestedCharge)}
                    </span>
                    {' '}({estimatedWeightKg} kg × Rp {Number(overrideChargeRate).toLocaleString('id-ID')})
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
            <Label>Catatan</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan pengiriman (opsional)"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading} className="bg-purple-600 hover:bg-purple-700">
            {isLoading ? (
              <>
                <span className="h-3 w-3 border-2 border-background/30 border-t-background rounded-full animate-spin mr-2" />
                Membuat...
              </>
            ) : salesLabels.buatSuratJalan}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}