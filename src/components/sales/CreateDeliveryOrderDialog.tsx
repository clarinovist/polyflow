'use client';

import { useState, useEffect } from 'react';
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
import { Plus, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { createManualDeliveryOrder } from '@/actions/inventory/deliveries';
import { getSalesOrders } from '@/actions/sales/sales';
import { getLocations } from '@/actions/inventory/inventory';
import { useRouter } from 'next/navigation';

interface SalesOrder {
  id: string;
  orderNumber: string;
  customer?: { name: string } | null;
}

interface Location {
  id: string;
  name: string;
}

export function CreateDeliveryOrderDialog() {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedSalesOrderId, setSelectedSalesOrderId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (open) {
      // Load sales orders and locations in parallel
      Promise.all([
        getSalesOrders(false, undefined, 'customer'),
        getLocations(),
      ]).then(([ordersRes, locationsRes]) => {
        if (ordersRes.success && ordersRes.data) {
          setSalesOrders(ordersRes.data as SalesOrder[]);
        }
        if (locationsRes.success && locationsRes.data) {
          setLocations(locationsRes.data as Location[]);
        }
      });
    }
  }, [open]);

  const resetForm = () => {
    setSelectedSalesOrderId('');
    setSelectedLocationId('');
    setCarrier('');
    setTrackingNumber('');
    setNotes('');
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
      <DialogContent className="sm:max-w-[500px]">
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
            <Label>Sales Order</Label>
            <Select value={selectedSalesOrderId} onValueChange={setSelectedSalesOrderId}>
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
            <Label>Lokasi Gudang</Label>
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
