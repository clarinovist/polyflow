"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Play,
  CheckCircle,
  Send,
  Loader2,
  Package,
} from "lucide-react";
import { updateDeliveryStatus, saveDeliveryLoadVerification } from "@/actions/inventory/deliveries";
import { toast } from "sonner";

type OrderItem = {
  id: string;
  quantity: number;
  verifiedQuantity?: number | null;
  productVariant?: {
    name: string;
    skuCode: string;
    primaryUnit: string;
  };
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  deliveryDate: string;
  notes?: string;
  sourceLocation?: { name: string };
  salesOrder?: {
    orderNumber: string;
    customer?: { name: string };
  };
  items: OrderItem[];
};

export function WarehouseOutgoingDetailClient({ order }: { order: Order }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [verifyDraft, setVerifyDraft] = useState<Record<string, string>>(() => {
    const draft: Record<string, string> = {};
    for (const item of order.items) {
      draft[item.id] =
        item.verifiedQuantity != null ? String(item.verifiedQuantity) : "";
    }
    return draft;
  });

  const handleStartLoading = async () => {
    setLoading(true);
    try {
      const result = await updateDeliveryStatus(order.id, "LOADING");
      if (result.success) {
        toast.success("Muat dimulai");
        router.refresh();
      } else {
        toast.error(result.error || "Gagal memulai muat");
      }
    } catch {
      toast.error("Gagal memulai muat");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    const payload = Object.entries(verifyDraft)
      .filter(([, v]) => v !== "")
      .map(([id, v]) => ({
        id,
        verifiedQuantity: Number(v),
      }));

    if (payload.length === 0) {
      toast.error("Isi minimal satu qty verifikasi");
      return;
    }

    setLoading(true);
    try {
      const result = await saveDeliveryLoadVerification({
        deliveryOrderId: order.id,
        items: payload,
      });
      if (result.success) {
        toast.success("Verifikasi tersimpan");
        router.refresh();
      } else {
        toast.error(result.error || "Gagal menyimpan verifikasi");
      }
    } catch {
      toast.error("Gagal menyimpan verifikasi");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkShipped = async () => {
    setLoading(true);
    try {
      const result = await updateDeliveryStatus(order.id, "SHIPPED");
      if (result.success) {
        toast.success("Berhasil dikirim! Stok terpotong.");
        router.push("/warehouse/mobile/outgoing");
      } else {
        toast.error(result.error || "Gagal menandai dikirim");
      }
    } catch {
      toast.error("Gagal menandai dikirim");
    } finally {
      setLoading(false);
    }
  };

  const isPending = order.status === "PENDING";
  const isLoading = order.status === "LOADING";

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold truncate">{order.orderNumber}</h1>
            <Badge
              variant={isLoading ? "default" : "secondary"}
              className="text-[10px] shrink-0"
            >
              {order.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {order.salesOrder?.customer?.name || "—"}
          </p>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 border rounded-xl space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Gudang</span>
          <span className="font-medium">{order.sourceLocation?.name || "—"}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Tanggal</span>
          <span className="font-medium">
            {new Date(order.deliveryDate).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
        {order.notes && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Catatan</span>
            <span className="font-medium text-right max-w-[60%] truncate">{order.notes}</span>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Barang ({order.items.length})</h2>
        {order.items.map((item) => (
          <div key={item.id} className="p-3 border rounded-xl space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {item.productVariant?.name || "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {item.productVariant?.skuCode} • {item.productVariant?.primaryUnit}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold">{item.quantity}</p>
                <p className="text-[10px] text-muted-foreground">dipesan</p>
              </div>
            </div>

            {/* Verify input (only when LOADING) */}
            {isLoading && (
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-muted-foreground shrink-0">
                  Verifikasi:
                </label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder={String(item.quantity)}
                  value={verifyDraft[item.id] || ""}
                  onChange={(e) =>
                    setVerifyDraft((prev) => ({
                      ...prev,
                      [item.id]: e.target.value,
                    }))
                  }
                  className="h-9 text-sm"
                />
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {item.productVariant?.primaryUnit}
                </span>
              </div>
            )}

            {/* Verified qty display */}
            {!isLoading && item.verifiedQuantity != null && (
              <div className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle className="h-3 w-3" />
                Diverifikasi: {item.verifiedQuantity}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-2">
        {isPending && (
          <Button
            className="w-full h-12"
            disabled={loading}
            onClick={handleStartLoading}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <Play className="h-5 w-5 mr-2" />
            )}
            Mulai Muat
          </Button>
        )}

        {isLoading && (
          <>
            <Button
              variant="outline"
              className="w-full h-11"
              disabled={loading}
              onClick={handleVerify}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Simpan Verifikasi
            </Button>
            <Button
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700"
              disabled={loading}
              onClick={handleMarkShipped}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <Send className="h-5 w-5 mr-2" />
              )}
              Tandai Dikirim
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
