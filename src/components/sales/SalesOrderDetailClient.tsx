"use client";

import { SalesOrderStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getStatusLabel,
  salesLabels,
  formLabels,
  actionLabels,
} from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/utils/utils";
import { format } from "date-fns";
import {
  ArrowLeft,
  Edit,
  Truck,
  CheckCircle,
  XCircle,
  Package,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import {
  confirmSalesOrder,
  deliverSalesOrder,
  cancelSalesOrder,
  deleteSalesOrder,
  markReadyToShip,
} from "@/actions/sales/sales";
import { createInvoice } from "@/actions/finance/invoice";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ProductionStatusCard } from "./ProductionStatusCard";
import { ShipmentDialog } from "./ShipmentDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  getEnteredQuantityDisplay,
  getEnteredUnitPriceDisplay,
} from "@/lib/utils/production-units";
import type { SalesOrderDetailClientProps } from "./sales-order-types";

export function SalesOrderDetailClient({
  order,
  basePath = "/sales/orders",
  warehouseMode = false,
}: SalesOrderDetailClientProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isShipDialogOpen, setIsShipDialogOpen] = useState(false);
  const isLegacyInternalOrder = !order.customerId;
  const isMaklonOrder = order.orderType === "MAKLON_JASA";
  const customerLabel = order.customer?.name || "Legacy Internal Stock Build";

  // MRP Simulation State

  const handleAction = async (
    action: string,
    handler: (id: string) => Promise<{ success: boolean; error?: string }>,
  ) => {
    setIsLoading(true);
    try {
      const result = await handler(order.id);
      if (result.success) {
        const actionText =
          action === "approve"
            ? "disetujui"
            : action === "cancel"
              ? "dibatalkan"
              : "diproses";
        toast.success(`Pesanan berhasil ${actionText}`);
        router.refresh();
      } else {
        toast.error(
          result.error ||
            "Gagal memproses tindakan pada pesanan. Silakan coba lagi.",
        );
      }
    } catch {
      toast.error("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateInvoice = async () => {
    if (isLegacyInternalOrder) {
      toast.error(
        "Invoice diblokir untuk Sales Order tanpa customer. Gunakan Perintah Produksi untuk pembuatan stok internal.",
      );
      return;
    }

    if (order.status !== "SHIPPED" && order.status !== "DELIVERED") {
      toast.error("Pesanan harus dikirim atau terkirim untuk membuat invoice.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await createInvoice({
        salesOrderId: order.id,
        invoiceDate: new Date(),
        termOfPaymentDays: order.customer?.paymentTermDays ?? 30,
        notes: `Invoice for Order ${order.orderNumber}`,
      });

      if (result.success) {
        toast.success("Invoice berhasil dibuat");
        router.refresh();
      } else {
        toast.error(
          result.error || "Gagal membuat invoice. Silakan coba lagi.",
        );
      }
    } catch (_error) {
      toast.error("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      const result = await deleteSalesOrder(order.id);
      if (result.success) {
        toast.success("Pesanan berhasil dihapus");
        router.push(basePath);
      } else {
        toast.error(
          result.error || "Gagal menghapus pesanan. Silakan coba lagi.",
        );
      }
    } catch (_error) {
      toast.error("Gagal menghapus pesanan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: SalesOrderStatus) => {
    const styles: Record<string, string> = {
      DRAFT:
        "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
      CONFIRMED:
        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      IN_PRODUCTION:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
      READY_TO_SHIP:
        "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
      SHIPPED:
        "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
      DELIVERED:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
      CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    };
    return (
      <Badge variant="secondary" className={styles[status] || styles.DRAFT}>
        {getStatusLabel(status, "sales")}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {isLegacyInternalOrder && (
        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/20">
          <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          <AlertTitle>{formLabels.legacyInternalOrder}</AlertTitle>
          <AlertDescription>
            This Sales Order has no customer and is treated as a legacy internal
            stock build. New invoicing is blocked. Use Production Order for
            internal replenishment, or assign a customer before continuing with
            customer billing.
          </AlertDescription>
        </Alert>
      )}

      {isMaklonOrder && (
        <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-900/20">
          <AlertTriangle className="h-4 w-4 text-blue-700 dark:text-blue-400" />
          <AlertTitle>Maklon Jasa flow</AlertTitle>
          <AlertDescription>
            Order ini menagihkan jasa, bukan mengirim stok fisik dari sales
            order. Bahan titipan customer dikonsumsi saat production execution
            dari lokasi produksi dulu, lalu fallback ke lokasi customer-owned
            bila diperlukan.
          </AlertDescription>
        </Alert>
      )}

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Link href={basePath as any}>
              <ArrowLeft className="mr-2 h-4 w-4" /> {actionLabels.back}
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              Order {order.orderNumber}
              {getStatusBadge(order.status)}
            </h1>
            <p className="text-muted-foreground text-sm">
              {formLabels.createdOn} {format(new Date(order.orderDate), "PPP")}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {/* Button Place */}

          {!warehouseMode && order.status === "DRAFT" && (
            <>
              <Button variant="outline" asChild>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Link href={`${basePath}/${order.id}/edit` as any}>
                  <Edit className="mr-2 h-4 w-4" /> {actionLabels.edit}
                </Link>
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={isLoading}>
                    {actionLabels.delete}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Aksi ini tidak dapat dibatalkan. Ini akan menghapus draf
                      order secara permanen.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{actionLabels.cancel}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      {actionLabels.delete}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                onClick={() => handleAction("confirmed", confirmSalesOrder)}
                disabled={isLoading || isLegacyInternalOrder}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <CheckCircle className="mr-2 h-4 w-4" /> Konfirmasi Order
              </Button>
            </>
          )}

          {order.status === "IN_PRODUCTION" && (
            <Button
              onClick={() => handleAction("ready to ship", markReadyToShip)}
              disabled={isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Package className="mr-2 h-4 w-4" />{" "}
              {isMaklonOrder
                ? "Produksi Selesai / Siap Tutup Jasa"
                : "Produksi Selesai"}
            </Button>
          )}

          {(order.status === "CONFIRMED" ||
            order.status === "READY_TO_SHIP") && (
            <Button
              onClick={() => setIsShipDialogOpen(true)}
              disabled={isLoading}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Truck className="mr-2 h-4 w-4" />{" "}
              {isMaklonOrder ? "Tutup Order Jasa" : "Kirim Order"}
            </Button>
          )}

          {(order.status === "SHIPPED" || order.status === "DELIVERED") && (
            <>
              {order.status === "SHIPPED" && (
                <Button
                  onClick={() => handleAction("delivered", deliverSalesOrder)}
                  disabled={isLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Package className="mr-2 h-4 w-4" />{" "}
                  {isMaklonOrder ? "Tandai Jasa Selesai" : "Tandai Terkirim"}
                </Button>
              )}

              {!warehouseMode && order.invoices.length === 0 && (
                <Button
                  onClick={handleGenerateInvoice}
                  disabled={isLoading || isLegacyInternalOrder}
                  className="bg-sky-600 hover:bg-sky-700 text-white"
                >
                  <Receipt className="mr-2 h-4 w-4" /> Buat Invoice
                </Button>
              )}
              {!warehouseMode &&
                order.invoices.length > 0 &&
                order.invoices.some((i) => i.status === "DRAFT") && (
                  <Button
                    variant="outline"
                    className="border-sky-600 text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30"
                    asChild
                  >
                    <Link
                      href={`/finance/invoices/sales/${order.invoices.find((i) => i.status === "DRAFT")?.id}`}
                    >
                      <Receipt className="mr-2 h-4 w-4" /> Lihat Draf Invoice
                    </Link>
                  </Button>
                )}
            </>
          )}

          {!warehouseMode &&
            ["DRAFT", "CONFIRMED", "IN_PRODUCTION", "READY_TO_SHIP"].includes(
              order.status,
            ) && (
              <Button
                variant="ghost"
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-500 dark:hover:bg-red-900/30"
                onClick={() => handleAction("cancelled", cancelSalesOrder)}
                disabled={isLoading}
              >
                <XCircle className="mr-2 h-4 w-4" /> {actionLabels.cancel}
              </Button>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Order Info */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Detail Pesanan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold text-sm text-muted-foreground">
                  {salesLabels.customer}
                </h3>
                <p className="text-lg">{customerLabel}</p>
                <p className="text-sm text-muted-foreground">
                  {order.customer?.email ||
                    (isLegacyInternalOrder
                      ? "No customer assigned"
                      : "No email")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {order.customer?.phone || ""}
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-muted-foreground">
                  {isMaklonOrder
                    ? "Lokasi Produksi"
                    : salesLabels.sourceWarehouse}
                </h3>
                <p className="text-lg">{order.sourceLocation?.name || "N/A"}</p>
                {isMaklonOrder && (
                  <p className="text-sm text-muted-foreground">
                    Dipakai sebagai lokasi produksi/default consumption location
                    untuk work order maklon.
                  </p>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-sm text-muted-foreground">
                  {salesLabels.expectedDate}
                </h3>
                <p>
                  {order.expectedDate
                    ? format(new Date(order.expectedDate), "PPP")
                    : "-"}
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-muted-foreground">
                  {salesLabels.orderType}
                </h3>
                <Badge variant="outline">
                  {order.orderType.replace(/_/g, " ")}
                </Badge>
              </div>
            </div>

            {order.notes && (
              <div className="bg-muted/50 p-4 rounded-md">
                <h3 className="font-semibold text-sm mb-1">
                  {formLabels.notes}
                </h3>
                <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
              </div>
            )}

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="h-10 px-4 text-left font-medium">
                      {formLabels.product}
                    </th>
                    <th className="h-10 px-4 text-right font-medium">
                      {formLabels.qty}
                    </th>
                    <th className="h-10 px-4 text-right font-medium">
                      Terkirim
                    </th>
                    {!warehouseMode && (
                      <th className="h-10 px-4 text-right font-medium">
                        {formLabels.unitPrice}
                      </th>
                    )}
                    {!warehouseMode && (
                      <th className="h-10 px-4 text-right font-medium">
                        {formLabels.subtotal}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {order.items.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/50">
                      <td className="p-4">
                        <div className="font-medium">
                          {item.productVariant.product.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.productVariant.name} -{" "}
                          {item.productVariant.skuCode}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        {getEnteredQuantityDisplay({
                          ...item,
                          ...item.productVariant,
                        })}
                      </td>
                      <td className="p-4 text-right">
                        <span
                          className={
                            Number(item.deliveredQty) > 0
                              ? "text-emerald-600 dark:text-emerald-400 font-medium"
                              : "text-muted-foreground"
                          }
                        >
                          {getEnteredQuantityDisplay({
                            ...item,
                            ...item.productVariant,
                            quantity: item.deliveredQty,
                            enteredQuantity:
                              item.enteredQuantity && Number(item.quantity) > 0
                                ? (Number(item.enteredQuantity) *
                                    Number(item.deliveredQty)) /
                                  Number(item.quantity)
                                : null,
                          })}
                        </span>
                      </td>
                      {!warehouseMode && (
                        <td className="p-4 text-right">
                          {(() => {
                            const price = getEnteredUnitPriceDisplay({
                              ...item,
                              ...item.productVariant,
                            });
                            return `${formatRupiah(price.price)}/${price.unit}`;
                          })()}
                        </td>
                      )}
                      {!warehouseMode && (
                        <td className="p-4 text-right font-medium">
                          {formatRupiah(Number(item.subtotal))}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                {!warehouseMode && (
                  <tfoot className="bg-muted/50 border-t">
                    {Number(order.discountAmount) > 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-2 text-right text-sm text-muted-foreground"
                        >
                          Diskon
                        </td>
                        <td className="p-2 text-right text-sm text-red-500">
                          -{formatRupiah(Number(order.discountAmount))}
                        </td>
                      </tr>
                    )}
                    {Number(order.taxAmount) > 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-2 text-right text-sm text-muted-foreground"
                        >
                          PPN
                        </td>
                        <td className="p-2 text-right text-sm">
                          {formatRupiah(Number(order.taxAmount))}
                        </td>
                      </tr>
                    )}
                    {Number(order.shippingCost || 0) > 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-2 text-right text-sm text-muted-foreground"
                        >
                          Ongkos Kirim
                        </td>
                        <td className="p-2 text-right text-sm">
                          {formatRupiah(Number(order.shippingCost))}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={4} className="p-4 text-right font-bold">
                        Total Keseluruhan
                      </td>
                      <td className="p-4 text-right font-bold text-lg">
                        {formatRupiah(Number(order.totalAmount))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar Info (Invoices / Movements / Production) */}
        <div className="space-y-6">
          {/* INVOICES CARD */}
          {!warehouseMode && (
            <Card>
              <CardHeader>
                <CardTitle>{salesLabels.invoice}</CardTitle>
                <CardDescription>
                  Invoice yang diterbitkan untuk order ini
                </CardDescription>
              </CardHeader>
              <CardContent>
                {order.invoices && order.invoices.length > 0 ? (
                  <ul className="space-y-4">
                    {order.invoices.map((inv) => (
                      <li
                        key={inv.id}
                        className="border p-3 rounded-md hover:bg-muted/50 transition-colors"
                      >
                        <Link
                          href={`/finance/invoices/sales/${inv.id}`}
                          className="block"
                        >
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                              {inv.invoiceNumber}
                            </span>
                            <Badge
                              variant={
                                inv.status === "PAID"
                                  ? "default"
                                  : "destructive"
                              }
                            >
                              {getStatusLabel(inv.status, "finance")}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground mb-1">
                            {format(new Date(inv.invoiceDate), "PP")}
                          </div>
                          <div className="font-semibold">
                            {formatRupiah(Number(inv.totalAmount))}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {salesLabels.emptyInvoices}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <ProductionStatusCard
            salesOrderId={order.id}
            status={order.status}
            productionOrders={order.productionOrders}
            items={order.items}
          />

          <Card>
            <CardHeader>
              <CardTitle>
                {isMaklonOrder
                  ? "Riwayat Penutupan Jasa"
                  : "Riwayat Pengiriman"}
              </CardTitle>
              <CardDescription>
                {isMaklonOrder
                  ? "Progres penutupan untuk order jasa maklon"
                  : "Mutasi stok terkait order ini"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {order.movements.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {isMaklonOrder
                    ? "Belum ada mutasi stok penutupan jasa yang tercatat dari sales. Konsumsi bahan dilacak dari eksekusi produksi."
                    : "Belum ada pengiriman."}
                </p>
              ) : (
                <ul className="space-y-4">
                  {order.movements.map((m) => (
                    <li
                      key={m.id}
                      className="text-sm border-l-2 border-purple-200 dark:border-purple-800/50 pl-4 py-1"
                    >
                      <div className="font-medium">
                        {isMaklonOrder
                          ? `Recorded sales shipment movement ${Number(m.quantity)} units`
                          : `Shipped ${Number(m.quantity)} units`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(m.createdAt), "PP p")}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      {/* MRP Simulation Dialog */}

      <ShipmentDialog
        orderId={order.id}
        orderNumber={order.orderNumber}
        isMaklon={isMaklonOrder}
        isOpen={isShipDialogOpen}
        onClose={() => setIsShipDialogOpen(false)}
      />
    </div>
  );
}
