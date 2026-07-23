"use client";

import Link from "next/link";
import {
  Package,
  ArrowRight,
  CheckCircle,
  Building2,
  Calendar,
} from "lucide-react";

type ReceivablePO = {
  id: string;
  orderNumber: string;
  orderDate: Date | string;
  expectedDate: Date | string | null;
  status: string;
  supplier: { name: string; code: string | null };
  items: {
    id: string;
    quantity: number;
    receivedQty: number;
    productVariant: {
      name: string;
      skuCode: string;
      primaryUnit: string;
    };
  }[];
};

type TodayGR = {
  id: string;
  receiptNumber: string;
  receivedDate: Date | string;
  notes?: string | null;
  purchaseOrder: {
    id: string;
    orderNumber: string;
    supplier: { name: string };
  } | null;
};

export function WarehouseIncomingMobileClient({
  receivablePOs,
  todayReceipts,
}: {
  receivablePOs: ReceivablePO[];
  todayReceipts: TodayGR[];
}) {
  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Penerimaan Barang</h1>
        <p className="text-sm text-muted-foreground">
          {receivablePOs.length} PO menunggu diterima
        </p>
      </div>

      {/* Today Receipts */}
      {todayReceipts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Diterima Hari Ini</h2>
          <div className="space-y-2">
            {todayReceipts.map((gr) => (
              <div
                key={gr.id}
                className="p-3 border rounded-xl bg-emerald-50 dark:bg-emerald-950/20"
              >
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  <p className="text-sm font-medium truncate">
                    {gr.receiptNumber}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {gr.purchaseOrder?.supplier?.name || "—"} •{" "}
                  {gr.purchaseOrder?.orderNumber || "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Receivable POs */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">
          Perlu Diterima ({receivablePOs.length})
        </h2>
        {receivablePOs.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">
              Tidak ada PO yang perlu diterima
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {receivablePOs.map((po) => {
              const totalItems = po.items.length;
              const receivedItems = po.items.filter(
                (i) => i.receivedQty >= i.quantity,
              ).length;

              return (
                <Link
                  key={po.id}
                  href={`/warehouse/mobile/incoming/${po.id}`}
                  className="block p-4 border rounded-xl bg-card active:scale-[0.98] transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">
                        {po.orderNumber}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                        <p className="text-xs text-muted-foreground truncate">
                          {po.supplier.name}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  </div>

                  <div className="flex items-center gap-3 mt-2 pt-2 border-t text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {receivedItems}/{totalItems} item
                    </div>
                    {po.expectedDate && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(po.expectedDate).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                        })}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
