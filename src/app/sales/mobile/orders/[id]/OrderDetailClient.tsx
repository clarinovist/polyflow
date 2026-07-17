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
  ClipboardList,
  FileText,
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
import { createSalesReturnAction } from "@/actions/sales/sales-returns";
import { useState } from "react";
import { toast } from "sonner";
import { getMobileStatusColor, getMobileStatusLabel } from "../../lib/status-helpers";
import { ReturnReason, ItemCondition } from "@prisma/client";
import { CreateDeliveryOrderDialog } from "@/components/sales/CreateDeliveryOrderDialog";
import { salesLabels } from "@/lib/labels";
import Link from "next/link";

type OrderItem = {
  id: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  skuCode: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  deliveredQty: number;
};

type DeliveryItem = {
  id: string;
  variantName: string;
  productName: string;
  quantity: number;
};

type DeliveryOrder = {
  id: string;
  orderNumber: string;
  deliveryDate: string;
  status: string;
  trackingNumber: string | null;
  carrier: string | null;
  notes: string | null;
  items: DeliveryItem[];
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
  deliveryOrders: DeliveryOrder[];
};

type LocationOption = {
  id: string;
  name: string;
};

interface OrderDetailClientProps {
  order: Order;
  locations: LocationOption[];
}

const RETURN_REASONS = [
  { value: "DAMAGED", label: "Barang Rusak (Damaged)" },
  { value: "DEFECT", label: "Cacat Produksi (Defect)" },
  { value: "WRONG_ITEM", label: "Salah Kirim Barang" },
  { value: "OVER_SHIPMENT", label: "Kelebihan Kirim" },
  { value: "EXPIRED", label: "Kadaluarsa" },
  { value: "QUALITY_ISSUE", label: "Masalah Kualitas" },
  { value: "OTHER", label: "Lainnya" }
];

const ITEM_CONDITIONS = [
  { value: "DAMAGED", label: "Rusak / Bad Stock" },
  { value: "GOOD", label: "Bagus / Good Stock" }
];

export function OrderDetailClient({ order, locations }: OrderDetailClientProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  
  // Return Form State
  const [returnLocationId, setReturnLocationId] = useState(locations[0]?.id || "");
  const [generalReason, setGeneralReason] = useState("DAMAGED");
  const [generalNotes, setGeneralNotes] = useState("");
  type ReturnItemState = {
    returnedQty: number;
    reason: string;
    condition: string;
    notes: string;
    checked: boolean;
  };

  const [returnItems, setReturnItems] = useState<Record<string, ReturnItemState>>(() => {
    const initial: Record<string, ReturnItemState> = {};
    order.items.forEach(item => {
      initial[item.productVariantId] = {
        returnedQty: 1,
        reason: "DAMAGED",
        condition: "DAMAGED",
        notes: "",
        checked: false
      };
    });
    return initial;
  });

  const handleAction = async (
    actionLabel: string,
    handler: () => Promise<{ success: boolean; error?: string; data?: unknown }>,
    onSuccess?: (data: unknown) => void,
  ) => {
    setIsLoading(true);
    try {
      const result = await handler();
      if (result.success) {
        toast.success(`${actionLabel} berhasil`);
        if (onSuccess) {
          onSuccess(result.data);
        }
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

  const handleItemCheck = (variantId: string, checked: boolean) => {
    setReturnItems(prev => ({
      ...prev,
      [variantId]: { ...prev[variantId], checked }
    }));
  };

  const handleItemQtyChange = (variantId: string, qty: number, maxQty: number) => {
    const safeQty = Math.max(1, Math.min(qty, maxQty));
    setReturnItems(prev => ({
      ...prev,
      [variantId]: { ...prev[variantId], returnedQty: safeQty }
    }));
  };

  const handleItemFieldChange = (variantId: string, field: string, value: string) => {
    setReturnItems(prev => ({
      ...prev,
      [variantId]: { ...prev[variantId], [field]: value }
    }));
  };

  const handleSubmitReturn = async () => {
    const itemsToReturn = Object.keys(returnItems)
      .map((variantId) => {
        const value = returnItems[variantId];
        const orderItem = order.items.find(i => i.productVariantId === variantId);
        return {
          productVariantId: variantId,
          returnedQty: value.returnedQty,
          unitPrice: orderItem ? orderItem.unitPrice : 0,
          reason: value.reason as ReturnReason,
          condition: value.condition as ItemCondition,
          notes: value.notes || null,
          checked: value.checked,
        };
      })
      .filter(item => item.checked)
      .map(({ checked: _checked, ...item }) => item);

    if (itemsToReturn.length === 0) {
      toast.error("Pilih minimal satu produk untuk diretur");
      return;
    }

    if (!returnLocationId) {
      toast.error("Pilih lokasi gudang retur");
      return;
    }

    setIsLoading(true);
    try {
      const response = await createSalesReturnAction({
        salesOrderId: order.id,
        deliveryOrderId: order.deliveryOrders[0]?.id || null,
        customerId: order.customer?.id || null,
        returnLocationId,
        reason: generalReason,
        notes: generalNotes || null,
        items: itemsToReturn,
      });

      if (response?.success) {
        toast.success("Pengajuan retur berhasil dibuat!");
        setShowReturnModal(false);
        router.refresh();
      } else {
        toast.error((response as { error?: string })?.error || "Gagal membuat pengajuan retur");
      }
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan sistem saat membuat pengajuan retur");
    } finally {
      setIsLoading(false);
    }
  };

  const subtotal = order.items.reduce((sum, item) => sum + item.subtotal, 0);
  const openDeliveryOrders = order.deliveryOrders.filter(
    (d) => d.status === "PENDING" || d.status === "LOADING",
  );
  const primaryOpenDo = openDeliveryOrders.length === 1 ? openDeliveryOrders[0] : null;
  const canCreateSj =
    order.status === "CONFIRMED" ||
    order.status === "IN_PRODUCTION" ||
    order.status === "READY_TO_SHIP";

  return (
    <div className="p-4 space-y-4 pb-28">
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
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    Terkirim: {item.deliveredQty} Qty
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

      {/* Delivery Tracking Card */}
      {order.deliveryOrders.length > 0 && (
        <div className="border rounded-xl p-4 bg-muted/10 space-y-3">
          <div className="flex items-center gap-2">
            <Truck className="h-4.5 w-4.5 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Informasi Pengiriman</h3>
          </div>
          <div className="space-y-3">
            {order.deliveryOrders.map((doItem) => (
              <div key={doItem.id} className="p-3 bg-card border rounded-xl space-y-2.5 text-xs shadow-xs">
                <div className="flex justify-between items-center gap-2">
                  <Link
                    href={`/sales/deliveries/${doItem.id}`}
                    className="font-bold text-primary underline-offset-2 hover:underline"
                  >
                    {doItem.orderNumber}
                  </Link>
                  <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full capitalize font-semibold border-primary/20 text-primary bg-primary/5">
                    {doItem.status.toLowerCase()}
                  </Badge>
                </div>
                {(doItem.status === "PENDING" || doItem.status === "LOADING") && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    {salesLabels.sjPendingHint}.{" "}
                    <Link href={`/sales/deliveries/${doItem.id}`} className="font-semibold underline">
                      {salesLabels.tandaiDikirim}
                    </Link>
                  </p>
                )}
                {(doItem.carrier || doItem.trackingNumber) && (
                  <div className="p-2 bg-muted/30 rounded-lg space-y-1">
                    {doItem.carrier && (
                      <p className="text-muted-foreground">
                        Kurir/Ekspedisi: <span className="font-bold text-foreground">{doItem.carrier}</span>
                      </p>
                    )}
                    {doItem.trackingNumber && (
                      <p className="text-muted-foreground">
                        No. Resi Pelacakan: <span className="font-mono font-bold text-foreground">{doItem.trackingNumber}</span>
                      </p>
                    )}
                  </div>
                )}
                <div className="pt-2 border-t space-y-1.5">
                  <p className="font-bold text-muted-foreground text-[10px] uppercase tracking-wider">Item dalam Pengiriman:</p>
                  {doItem.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-muted-foreground">
                      <span className="truncate max-w-[220px]">{item.productName} ({item.variantName})</span>
                      <span className="font-semibold text-foreground shrink-0">{item.quantity} Qty</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
      {order.status !== "CANCELLED" && (
        <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t z-40 shadow-lg">
          <div className="flex flex-wrap gap-2">
            {order.status === "DRAFT" && (
              <>
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl h-11 text-sm font-semibold"
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
                  <XCircle className="h-4.5 w-4.5 mr-1.5" />
                  Batal
                </Button>
                <Button
                  className="flex-1 rounded-xl h-11 text-sm font-semibold"
                  disabled={isLoading}
                  onClick={() =>
                    handleAction(
                      "Konfirmasi",
                      () =>
                        confirmSalesOrder(order.id).then((r) => ({
                          success: r.success ?? false,
                          error: "error" in r ? r.error : undefined,
                          data: "data" in r ? r.data : undefined,
                        })),
                      (data) => {
                        const result = data as {
                          warnings?: { message: string }[];
                        } | undefined;
                        const warnings = result?.warnings ?? [];
                        if (warnings.length > 0) {
                          toast.warning(
                            warnings.map((w) => w.message).join(" "),
                          );
                        }
                      },
                    )
                  }
                >
                  <CheckCircle className="h-4.5 w-4.5 mr-1.5" />
                  Konfirmasi
                </Button>
              </>
            )}
            {/* MTO hot-loading: Buat SJ without stock (when no open DO) */}
            {canCreateSj && openDeliveryOrders.length === 0 && (
              <CreateDeliveryOrderDialog
                defaultSalesOrderId={order.id}
                triggerLabel={salesLabels.buatSuratJalan}
                triggerVariant="outline"
                triggerClassName="flex-1 rounded-xl h-11 text-sm font-semibold"
              />
            )}

            {/* Open SJ exists → go to DO detail for Tandai Dikirim (stock commit + confirm) */}
            {primaryOpenDo && (
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl h-11 text-sm font-semibold"
                asChild
              >
                <Link href={`/sales/deliveries/${primaryOpenDo.id}`}>
                  <FileText className="h-4.5 w-4.5 mr-1.5" />
                  {salesLabels.tandaiDikirim}
                </Link>
              </Button>
            )}
            {openDeliveryOrders.length > 1 && (
              <p className="w-full text-center text-[11px] text-amber-700 dark:text-amber-400">
                {salesLabels.selectDoToShip}
              </p>
            )}

            {(order.status === "CONFIRMED" || order.status === "READY_TO_SHIP") &&
              openDeliveryOrders.length === 0 && (
              <>
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl h-11 text-sm font-semibold"
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
                  <XCircle className="h-4.5 w-4.5 mr-1.5" />
                  Batal
                </Button>
                <Button
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-11 text-sm font-semibold"
                  disabled={isLoading}
                  onClick={() =>
                    handleAction(salesLabels.createAndShip, () =>
                      shipSalesOrder({ id: order.id }).then((r) => ({
                        success: r.success ?? false,
                        error: "error" in r ? r.error : undefined,
                      })),
                    )
                  }
                >
                  <Truck className="h-4.5 w-4.5 mr-1.5" />
                  {salesLabels.createAndShip}
                </Button>
              </>
            )}

            {order.status === "IN_PRODUCTION" && openDeliveryOrders.length === 0 && (
              <Button
                className="flex-1 rounded-xl h-11 text-sm font-semibold"
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
                <Package className="h-4.5 w-4.5 mr-1.5" />
                Siap Kirim
              </Button>
            )}
            {order.status === "SHIPPED" && (
              <>
                <Button
                  variant="outline"
                  className="flex-1 border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900/30 dark:text-rose-400 rounded-xl h-11 text-sm font-semibold"
                  onClick={() => setShowReturnModal(true)}
                >
                  <Package className="h-4.5 w-4.5 mr-1.5" />
                  Retur
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11 text-sm font-semibold"
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
                  <CheckCircle className="h-4.5 w-4.5 mr-1.5" />
                  Terkirim
                </Button>
              </>
            )}
            {order.status === "DELIVERED" && (
              <Button
                className="w-full bg-rose-600 hover:bg-rose-700 text-white rounded-xl h-11 text-sm font-semibold flex items-center justify-center gap-1.5"
                onClick={() => setShowReturnModal(true)}
              >
                <Package className="h-4.5 w-4.5" />
                Ajukan Retur Barang Rusak
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Return Request Modal Dialog */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-background border rounded-2xl shadow-2xl p-5 max-h-[85vh] flex flex-col space-y-4 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-lg text-foreground flex items-center gap-1.5">
                  <ClipboardList className="h-5 w-5 text-rose-600" />
                  Form Pengajuan Retur
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ajukan dokumen retur barang dari SO: {order.orderNumber}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowReturnModal(false)}
                className="h-8 w-8 p-0 rounded-full"
              >
                ✕
              </Button>
            </div>

            {/* Scrollable form body */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-sm">
              
              {/* Return Warehouse Location */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Lokasi Gudang Retur *</label>
                <select
                  value={returnLocationId}
                  onChange={(e) => setReturnLocationId(e.target.value)}
                  className="w-full h-10 px-3 border rounded-xl bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="" disabled>Pilih Gudang Retur</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* General Reason & Notes */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Alasan Umum *</label>
                  <select
                    value={generalReason}
                    onChange={(e) => setGeneralReason(e.target.value)}
                    className="w-full h-10 px-3 border rounded-xl bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {RETURN_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Keterangan Umum</label>
                  <input
                    type="text"
                    value={generalNotes}
                    onChange={(e) => setGeneralNotes(e.target.value)}
                    placeholder="Contoh: Retur barang reject..."
                    className="w-full h-10 px-3 border rounded-xl bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Items checklist */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pilih Produk Untuk Diretur</label>
                <div className="space-y-3.5 border rounded-xl p-3 bg-muted/10 max-h-[30vh] overflow-y-auto">
                  {order.items.map((item) => {
                    const status = returnItems[item.productVariantId] || {
                      returnedQty: 1,
                      reason: "DAMAGED",
                      condition: "DAMAGED",
                      notes: "",
                      checked: false
                    };

                    return (
                      <div key={item.id} className="border-b last:border-0 pb-3 last:pb-0 space-y-2">
                        <div className="flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={status.checked}
                            onChange={(e) => handleItemCheck(item.productVariantId, e.target.checked)}
                            className="mt-1 h-4.5 w-4.5 rounded-sm border-gray-300 text-rose-600 focus:ring-rose-500"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-xs text-foreground truncate">{item.productName}</p>
                            <p className="text-[10px] text-muted-foreground">{item.variantName} • Qty Order: {item.quantity}</p>
                          </div>
                        </div>

                        {status.checked && (
                          <div className="pl-7 grid grid-cols-2 gap-2.5 animate-in slide-in-from-top-2 duration-150">
                            {/* Quantity Input */}
                            <div className="space-y-0.5">
                              <span className="text-[9px] text-muted-foreground font-bold uppercase">Jumlah Retur</span>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleItemQtyChange(item.productVariantId, status.returnedQty - 1, item.quantity)}
                                  className="h-8 w-8 rounded-lg p-0 font-bold"
                                >
                                  -
                                </Button>
                                <input
                                  type="number"
                                  value={status.returnedQty}
                                  onChange={(e) => handleItemQtyChange(item.productVariantId, parseInt(e.target.value) || 1, item.quantity)}
                                  className="h-8 w-12 border rounded-lg bg-background text-center text-xs font-semibold focus:ring-1 focus:ring-primary outline-none"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleItemQtyChange(item.productVariantId, status.returnedQty + 1, item.quantity)}
                                  className="h-8 w-8 rounded-lg p-0 font-bold"
                                >
                                  +
                                </Button>
                              </div>
                            </div>

                            {/* Condition Pick */}
                            <div className="space-y-0.5">
                              <span className="text-[9px] text-muted-foreground font-bold uppercase">Kondisi Barang</span>
                              <select
                                value={status.condition}
                                onChange={(e) => handleItemFieldChange(item.productVariantId, "condition", e.target.value)}
                                className="w-full h-8 px-2 border rounded-lg bg-background text-xs outline-none focus:ring-1 focus:ring-primary"
                              >
                                {ITEM_CONDITIONS.map((c) => (
                                  <option key={c.value} value={c.value}>
                                    {c.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 justify-end pt-3 border-t">
              <Button
                variant="outline"
                onClick={() => setShowReturnModal(false)}
                className="h-10 rounded-xl px-4 text-xs font-semibold"
                disabled={isLoading}
              >
                Batal
              </Button>
              <Button
                onClick={handleSubmitReturn}
                disabled={isLoading}
                className="h-10 bg-rose-600 hover:bg-rose-700 text-white rounded-xl px-5 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-transform"
              >
                Kirim Pengajuan Retur
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
