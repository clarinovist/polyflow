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
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { updateDeliveryPricing } from '@/actions/inventory/deliveries';
import { getVehicles } from '@/actions/sales/vehicles';
import { getActiveTariff as fetchActiveTariff, listVehicleRouteOptions as fetchRouteOptions } from '@/actions/sales/vehicle-tariffs';
import { useRouter } from 'next/navigation';

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

interface EditDeliveryPricingDialogProps {
  order: {
    id: string;
    orderNumber: string;
    vehicleId?: string | null;
    appliedRouteName?: string | null;
    appliedRateType?: string | null;
    appliedCostRate?: { toNumber: () => number } | number | null;
    appliedChargeRate?: { toNumber: () => number } | number | null;
    estimatedWeightKg?: { toNumber: () => number } | number | null;
    totalCost?: { toNumber: () => number } | number | null;
    totalCharge?: { toNumber: () => number } | number | null;
  };
}

export function EditDeliveryPricingDialog({ order }: EditDeliveryPricingDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(order.vehicleId || '');
  const [selectedRouteName, setSelectedRouteName] = useState(order.appliedRouteName || '');
  const [routeOptions, setRouteOptions] = useState<string[]>([]);
  const [tariffRateType, setTariffRateType] = useState(order.appliedRateType || '');
  const [overrideCostRate, setOverrideCostRate] = useState(
    order.appliedCostRate != null ? String(Number(order.appliedCostRate)) : '',
  );
  const [overrideChargeRate, setOverrideChargeRate] = useState(
    order.appliedChargeRate != null ? String(Number(order.appliedChargeRate)) : '',
  );
  const [estimatedWeightKg, setEstimatedWeightKg] = useState(
    order.estimatedWeightKg != null ? String(Number(order.estimatedWeightKg)) : '',
  );
  const router = useRouter();

  const { suggestedCharge, suggestedCost } = useMemo(() => {
    if (tariffRateType !== 'PER_KG') return { suggestedCharge: null, suggestedCost: null };
    const weight = parseFloat(estimatedWeightKg);
    const chargeRate = parseFloat(overrideChargeRate);
    const costRate = parseFloat(overrideCostRate);
    if (!weight || weight <= 0) return { suggestedCharge: null, suggestedCost: null };
    return {
      suggestedCharge: chargeRate > 0 ? Math.round(weight * chargeRate * 100) / 100 : null,
      suggestedCost: costRate > 0 ? Math.round(weight * costRate * 100) / 100 : null,
    };
  }, [tariffRateType, estimatedWeightKg, overrideChargeRate, overrideCostRate]);

  const loadTariffForRoute = useCallback(async (vehicleId: string, routeName: string) => {
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
  }, []);

  useEffect(() => {
    if (open) {
      getVehicles({ status: 'ACTIVE' }).then((res) => {
        if (res.success && res.data) setVehicles(res.data as Vehicle[]);
      });
      if (order.vehicleId) {
        fetchRouteOptions(order.vehicleId).then((res) => {
          if (res.success && res.data) setRouteOptions(res.data as string[]);
        });
      }
    }
  }, [open, order.vehicleId]);

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
    const routesRes = await fetchRouteOptions(vehicleId);
    setRouteOptions((routesRes.success && routesRes.data) ? routesRes.data as string[] : []);
    await loadTariffForRoute(vehicleId, '');
  };

  const handleRouteChange = async (routeName: string) => {
    const resolved = routeName === '__all__' ? '' : routeName;
    setSelectedRouteName(resolved);
    if (selectedVehicleId) {
      await loadTariffForRoute(selectedVehicleId, resolved);
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const result = await updateDeliveryPricing({
        deliveryOrderId: order.id,
        vehicleId: selectedVehicleId || null,
        appliedRouteName: selectedRouteName || null,
        appliedRateType: tariffRateType as 'PER_KG' | 'FLAT_RATE' || null,
        appliedCostRate: overrideCostRate ? parseFloat(overrideCostRate) : null,
        appliedChargeRate: overrideChargeRate ? parseFloat(overrideChargeRate) : null,
        estimatedWeightKg: estimatedWeightKg ? parseFloat(estimatedWeightKg) : null,
        recomputeFromRates: true,
      });

      if (!result.success) {
        toast.error(result.error || 'Gagal update pricing');
        return;
      }

      const sync = result.data?.shippingSync;
      if (sync?.reason === 'INVOICE_LOCKED') {
        toast.warning('Charge disimpan di surat jalan, tetapi invoice sudah final — ongkir SO tidak diubah.');
      } else if (sync?.synced && sync.shippingCost > 0) {
        toast.success(`Ongkir SO diupdate ke ${fmtIDR(sync.shippingCost)}`);
      } else {
        toast.success('Pricing berhasil diupdate');
      }

      setOpen(false);
      router.refresh();
    } catch {
      toast.error('Gagal update pricing');
    } finally {
      setIsLoading(false);
    }
  };

  const fmtIDR = (v: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Tarif & Berat
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Pricing — {order.orderNumber}</DialogTitle>
          <DialogDescription>
            Ubah armada, rute, berat, atau tarif. Total akan dihitung ulang otomatis.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Kendaraan</Label>
            <Select value={selectedVehicleId} onValueChange={handleVehicleChange}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih kendaraan..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Tanpa Kendaraan</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.plateNumber} — {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedVehicleId && selectedVehicleId !== '__none__' && (
            <div className="space-y-2">
              <Label>Rute</Label>
              <Select value={selectedRouteName || '__all__'} onValueChange={handleRouteChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua Rute" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Rute</SelectItem>
                  {routeOptions.map((route) => (
                    <SelectItem key={route} value={route}>{route}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {tariffRateType && (
            <div className="p-3 bg-muted/50 rounded-lg border space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                Tarif: {tariffRateType === 'PER_KG' ? 'Per Kg' : 'Flat Rate'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Biaya Operasional (Rp)</Label>
                  <Input type="number" value={overrideCostRate} onChange={(e) => setOverrideCostRate(e.target.value)} min={0} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Charge Customer (Rp)</Label>
                  <Input type="number" value={overrideChargeRate} onChange={(e) => setOverrideChargeRate(e.target.value)} min={0} />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Estimasi Berat (Kg)</Label>
            <Input type="number" value={estimatedWeightKg} onChange={(e) => setEstimatedWeightKg(e.target.value)} min={0} placeholder="0" />
          </div>

          {tariffRateType === 'PER_KG' && (suggestedCharge != null || suggestedCost != null) && (
            <div className="text-xs rounded-md border bg-muted/40 px-3 py-2 space-y-0.5 text-muted-foreground">
              {suggestedCost != null && (
                <p>Est. biaya ops: <span className="font-medium text-foreground">{fmtIDR(suggestedCost)}</span></p>
              )}
              {suggestedCharge != null && (
                <p>Est. charge: <span className="font-medium text-foreground">{fmtIDR(suggestedCharge)}</span></p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
          <Button onClick={handleSubmit} disabled={isLoading} className="bg-purple-600 hover:bg-purple-700">
            {isLoading ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
