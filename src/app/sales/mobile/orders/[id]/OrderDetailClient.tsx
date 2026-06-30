"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Phone,
  MapPin,
  Truck,
  CheckCircle,
  Package,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { formatRupiah } from "@/lib/utils/utils";
import {
  confirmSalesOrder,
  deliverSalesOrder,
  cancelSalesOrder,
  markReadyToShip,
  shipSalesOrder,
} from "@/actions/sales/sales";
import { useState } from "react";
import { toast } from "sonner";
import { getMobileStatusColor, getMobileStatusLabel } from "../../lib/status-helpers";

type OrderItem = {
  id: string;
  productName: string;
  variantName: string;
  skuCode: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  deliveredQty: number;
};

type Order = {
  id: string;
  orderNumber: string;
  orderDate: string;
  status: string;
  totalAmount: number | null;
  discountAmount: number | null;
  taxAmount: number | null;
  shippingCost: number | null;
  notes: string | null;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    billingAddress: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  items: OrderItem[];
};

interface OrderDetailClientProps {
  order: Order;
}

export function OrderDetailClient({ order }: OrderDetailClientProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = async (
    actionLabel: string,
    handler: () => Promise<{ success: boolean; error?: string }>,
  ) => {
    setIsLoading(true);
    try {
      const result = await handler();
      if (result.success) {
        toast.success(`${actionLabel} berhasil`);
        router.refresh();
      } else {
        toast.error(result.error || `Gagal ${actionLabel.toLowerCase()}`);
      }
    } catch {
      toast.error("Gagal memuat detail pesanan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  const subtotal = order.items.reduce((sum, item) => sum + item.subtotal, 0);

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/sales/mobile/orders")}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold truncate">{order.orderNumber}</h1>
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 h-4 shrink-0 ${getMobileStatusColor(order.status)}`}
            >
              {getMobileStatusLabel(order.status)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {format(new Date(order.orderDate), "d MMMM yyyy")}
          </p>
        </div>
      </div>

      {/* Customer Card */}
      {order.customer && (
        <div className="border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold">Customer</h3>
          <p className="font-medium">{order.customer.name}</p>
          <div className="flex gap-2">
            {order.customer.phone && (
              <a
                href={`tel:${order.customer.phone}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg text-xs font-medium text-emerald-700 dark:text-emerald-400"
              >
                <Phone className="h-3.5 w-3.5" />
                Telepon
              </a>
            )}
            {order.customer.latitude && order.customer.longitude && (
              <a
                href={`https://www.google.com/maps?q=${order.customer.latitude},${order.customer.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-xs font-medium text-blue-700 dark:text-blue-400"
              >
                <MapPin className="h-3.5 w-3.5" />
                Navigasi
              </a>
            )}
          </div>
          {order.customer.billingAddress && (
            <p className="text-xs text-muted-foreground">
              {order.customer.billingAddress}
            </p>
          )}
        </div>
      )}

      {/* Items Card */}
      <div className="border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold">Produk</h3>
        <div className="space-y-3">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="flex justify-between items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {item.productName}
                </p>
                {item.variantName !== item.productName && (
                  <p className="text-xs text-muted-foreground">
                    {item.variantName}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {item.skuCode} • {item.quantity} × {formatRupiah(item.unitPrice)}
                </p>
                {item.deliveredQty > 0 && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    Terkirim: {item.deliveredQty}
                  </p>
                )}
              </div>
              <p className="text-sm font-semibold shrink-0">
                {formatRupiah(item.subtotal)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Summary Card */}
      <div className="border rounded-xl p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatRupiah(subtotal)}</span>
        </div>
        {order.discountAmount && order.discountAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Diskon</span>
            <span className="text-red-500">
              -{formatRupiah(order.discountAmount)}
            </span>
          </div>
        )}
        {order.taxAmount && order.taxAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">PPN</span>
            <span>{formatRupiah(order.taxAmount)}</span>
          </div>
        )}
        {order.shippingCost && order.shippingCost > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Ongkos Kirim</span>
            <span>{formatRupiah(order.shippingCost)}</span>
          </div>
        )}
        <div className="flex justify-between pt-2 border-t font-bold">
          <span>Total</span>
          <span className="text-lg">
            {order.totalAmount ? formatRupiah(order.totalAmount) : "-"}
          </span>
        </div>
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-1">Catatan</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {order.notes}
          </p>
        </div>
      )}

      {/* Sticky Action Bar */}
      {order.status !== "DELIVERED" && order.status !== "CANCELLED" && (
        <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t z-40">
          <div className="flex gap-2">
            {order.status === "DRAFT" && (
              <>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={isLoading}
                  onClick={() =>
                    handleAction("Batalkan", () =>
                      cancelSalesOrder(order.id).then((r) => ({
                        success: r.success ?? false,
                        error: "error" in r ? r.error : undefined,
                      })),
                    )
                  }
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Batal
                </Button>
                <Button
                  className="flex-1"
                  disabled={isLoading}
                  onClick={() =>
                    handleAction("Konfirmasi", () =>
                      confirmSalesOrder(order.id).then((r) => ({
                        success: r.success ?? false,
                        error: "error" in r ? r.error : undefined,
                      })),
                    )
                  }
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Konfirmasi
                </Button>
              </>
            )}
            {(order.status === "CONFIRMED" ||
              order.status === "READY_TO_SHIP") && (
              <>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={isLoading}
                  onClick={() =>
                    handleAction("Batalkan", () =>
                      cancelSalesOrder(order.id).then((r) => ({
                        success: r.success ?? false,
                        error: "error" in r ? r.error : undefined,
                      })),
                    )
                  }
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Batal
                </Button>
                <Button
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                  disabled={isLoading}
                  onClick={() =>
                    handleAction("Kirim", () =>
                      shipSalesOrder({ id: order.id }).then((r) => ({
                        success: r.success ?? false,
                        error: "error" in r ? r.error : undefined,
                      })),
                    )
                  }
                >
                  <Truck className="h-4 w-4 mr-1" />
                  Kirim
                </Button>
              </>
            )}
            {order.status === "IN_PRODUCTION" && (
              <Button
                className="flex-1"
                disabled={isLoading}
                onClick={() =>
                  handleAction("Siap Kirim", () =>
                    markReadyToShip(order.id).then((r) => ({
                      success: r.success ?? false,
                      error: "error" in r ? r.error : undefined,
                    })),
                  )
                }
              >
                <Package className="h-4 w-4 mr-1" />
                Siap Kirim
              </Button>
            )}
            {order.status === "SHIPPED" && (
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={isLoading}
                onClick={() =>
                  handleAction("Tandai Terkirim", () =>
                    deliverSalesOrder(order.id).then((r) => ({
                      success: r.success ?? false,
                      error: "error" in r ? r.error : undefined,
                    })),
                  )
                }
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Terkirim
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
