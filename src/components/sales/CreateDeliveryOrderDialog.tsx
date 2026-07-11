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
import { getSalesOrders } from '@/actions/sales/sales';
import { getLocations } from '@/actions/inventory/inventory';
import { getVehicles } from '@/actions/sales/vehicles';
import { getActiveTariff as fetchActiveTariff, listVehicleRouteOptions as fetchRouteOptions } from '@/actions/sales/vehicle-tariffs';
import { useRouter } from 'next/navigation';

interface SalesOrder {
  id: string;
  orderNumber: string;
  customer?: {
    name: string;
    shippingAddress?: string | null;
    billingAddress?: string | null;
    defaultVehicleId?: string | null;
  } | null;
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

export function CreateDeliveryOrderDialog({ defaultSalesOrderId }: { defaultSalesOrderId?: string }) {
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
      getSalesOrders(false, undefined, 'customer'),
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

  const handleSalesOrderChange = (soId: string) => {
    setSelectedSalesOrderId(soId);
    const so = salesOrders.find(o => o.id === soId);
    if (so?.customer) {
      // Default destination from customer
      if (!destinationAddress) {
        setDestinationAddress(so.customer.shippingAddress || so.customer.billingAddress || '');
      }
      // Auto-select default vehicle
      if (so.customer.defaultVehicleId && !selectedVehicleId) {
        const v = vehicles.find(v => v.id === so.customer!.defaultVehicleId);
        if (v) handleVehicleChange(so.customer.defaultVehicleId!);
      }
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

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button className="shadow-sm">
          <Plus className="mr-2 h-4 w-4" />
          Buat Surat Jalan Manual
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-purple-600" />
            Buat Surat Jalan Manual
          </DialogTitle>
          <DialogDescription>
            Buat Surat Jalan (Delivery Order) manual dari Sales Order yang sudah ada.
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
            ) : 'Buat Surat Jalan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}