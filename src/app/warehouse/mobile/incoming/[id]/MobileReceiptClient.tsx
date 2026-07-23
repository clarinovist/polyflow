"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  Package,
  Building2,
} from "lucide-react";
import { createGoodsReceipt } from "@/actions/purchasing/purchasing";
import { toast } from "sonner";

type OrderItem = {
  id: string;
  productVariantId: string;
  quantity: number;
  receivedQty: number;
  unitPrice: number;
  enteredUnit?: string;
  productVariant: {
    name: string;
    skuCode: string;
    primaryUnit: string;
  };
};

type Order = {
  id: string;
  orderNumber: string;
  orderDate: string;
  expectedDate: string | null;
  supplier: { name: string };
  items: OrderItem[];
};

type Location = { id: string; name: string };

export function MobileReceiptClient({
  order,
  locations,
}: {
  order: Order;
  locations: Location[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [notes, setNotes] = useState(`Penerimaan ${order.orderNumber}`);
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>(() => {
    const draft: Record<string, string> = {};
    for (const item of order.items) {
      const pending = Math.max(0, item.quantity - item.receivedQty);
      draft[item.id] = pending > 0 ? String(pending) : "";
    }
    return draft;
  });

  const handleSubmit = async () => {
    const items = order.items
      .map((item) => {
        const received = Number(qtyDraft[item.id] || 0);
        if (received <= 0) return null;
        return {
          productVariantId: item.productVariantId,
          receivedQty: received,
          unitCost: item.unitPrice,
        };
      })
      .filter(Boolean);

    if (items.length === 0) {
      toast.error("Isi minimal satu qty terima");
      return;
    }

    if (!locationId) {
      toast.error("Pilih gudang tujuan");
      return;
    }

    setLoading(true);
    try {
      const result = await createGoodsReceipt({
        purchaseOrderId: order.id,
        receivedDate: new Date(),
        locationId,
        notes,
        isMaklon: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: items as any,
      });

      if (result.success) {
        toast.success("Penerimaan barang berhasil dicatat");
        router.push("/warehouse/mobile/incoming");
      } else {
        toast.error(result.error || "Gagal mencatat penerimaan");
      }
    } catch {
      toast.error("Gagal mencatat penerimaan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{order.orderNumber}</h1>
          <p className="text-xs text-muted-foreground truncate">
            {order.supplier.name}
          </p>
        </div>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground flex items-center gap-1">
          <Building2 className="h-3 w-3" />
          Gudang Tujuan *
        </label>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="w-full h-11 px-3 border border-input rounded-lg bg-background text-sm"
        >
          <option value="">Pilih gudang</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {/* Items */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">
          Barang ({order.items.length})
        </h2>
        {order.items.map((item) => {
          const pending = Math.max(0, item.quantity - item.receivedQty);

          return (
            <div key={item.id} className="p-3 border rounded-xl space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {item.productVariant.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {item.productVariant.skuCode} • {item.productVariant.primaryUnit}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">
                    Pesan: {item.quantity}
                  </p>
                  {item.receivedQty > 0 && (
                    <p className="text-[10px] text-emerald-600">
                      Sudah terima: {item.receivedQty}
                    </p>
                  )}
                </div>
              </div>

              {pending > 0 ? (
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-muted-foreground shrink-0">
                    Terima:
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max={String(pending * 2)} // allow over-receipt
                    step="1"
                    placeholder={String(pending)}
                    value={qtyDraft[item.id] || ""}
                    onChange={(e) =>
                      setQtyDraft((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }))
                    }
                    className="h-9 text-sm"
                  />
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {item.productVariant.primaryUnit}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle className="h-3 w-3" />
                  Lengkap
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Catatan</label>
        <Input
          placeholder="Catatan penerimaan..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-11"
        />
      </div>

      {/* Submit */}
      <Button
        className="w-full h-12"
        disabled={loading || !locationId}
        onClick={handleSubmit}
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
        ) : (
          <Package className="h-5 w-5 mr-2" />
        )}
        {loading ? "Menyimpan..." : "Terima Barang"}
      </Button>
    </div>
  );
}
