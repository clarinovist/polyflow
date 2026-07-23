"use client";

import Link from "next/link";
import { Clock, Package, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  deliveryDate: string;
  sourceLocation?: { name: string };
  salesOrder?: { customer?: { name: string } };
};

export function WarehouseOutgoingMobileClient({ orders }: { orders: Order[] }) {
  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Antrian Muat</h1>
        <p className="text-sm text-muted-foreground">
          {orders.length} surat jalan menunggu
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">
            Tidak ada antrian muat saat ini
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/warehouse/mobile/outgoing/${order.id}`}
              className="block p-4 border rounded-xl bg-card active:scale-[0.98] transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold truncate">
                      {order.orderNumber}
                    </p>
                    <Badge
                      variant={order.status === "LOADING" ? "default" : "secondary"}
                      className="text-[10px] shrink-0"
                    >
                      {order.status === "LOADING" ? "Loading" : "Pending"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {order.salesOrder?.customer?.name || "—"}
                  </p>
                  {order.sourceLocation && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Gudang: {order.sourceLocation.name}
                    </p>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </div>

              {/* Delivery date */}
              <div className="flex items-center gap-1 mt-2 pt-2 border-t text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(order.deliveryDate).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                })}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
