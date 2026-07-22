"use client";

import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Eye, Truck, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { salesLabels, formLabels } from "@/lib/labels";
import { getDeliveryStatusLabel } from "@/lib/sales/delivery-status";

interface DeliveryOrderTableProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialData: any[];
  /** Detail/list base path — sales or warehouse portal */
  basePath?: string;
  /** active = open queue; history = closed archive (UI copy only for now) */
  mode?: "active" | "history";
}

export function DeliveryOrderTable({
  initialData,
  basePath = "/sales/deliveries",
  mode = "active",
}: DeliveryOrderTableProps) {
  const router = useRouter();
  void mode;

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PENDING: "bg-yellow-100 text-yellow-800",
      LOADING: "bg-orange-100 text-orange-800",
      SHIPPED: "bg-blue-100 text-blue-800",
      IN_TRANSIT: "bg-indigo-100 text-indigo-800",
      ARRIVED: "bg-teal-100 text-teal-800",
      DELIVERED: "bg-green-100 text-green-800",
      RETURNED: "bg-red-100 text-red-800",
      CANCELLED: "bg-gray-100 text-gray-800",
    };
    return (
      <Badge variant="secondary" className={styles[status] || styles.PENDING}>
        {getDeliveryStatusLabel(status)}
      </Badge>
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<any, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "orderNumber",
        header: `No. ${salesLabels.deliveryOrder}`,
        size: 150,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.orderNumber}</span>
        ),
      },
      {
        id: "salesOrderNumber",
        header: salesLabels.salesOrder,
        size: 150,
        accessorFn: (row) => row.salesOrder?.orderNumber || "",
        cell: ({ row }) => (
          <Link
            href={`/sales/orders/${row.original.salesOrderId}`}
            className="text-blue-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.original.salesOrder?.orderNumber}
          </Link>
        ),
      },
      {
        id: "customer",
        header: salesLabels.customer,
        size: 180,
        accessorFn: (row) => row.salesOrder?.customer?.name || "",
        cell: ({ row }) => row.original.salesOrder?.customer?.name || "-",
      },
      {
        accessorKey: "deliveryDate",
        header: salesLabels.deliveryDate,
        size: 130,
        sortingFn: "datetime",
        cell: ({ row }) => format(new Date(row.original.deliveryDate), "PP"),
      },
      {
        id: "sourceWarehouse",
        header: salesLabels.sourceWarehouse,
        size: 150,
        accessorFn: (row) => row.sourceLocation?.name || "",
        cell: ({ row }) => row.original.sourceLocation?.name,
      },
      {
        accessorKey: "carrier",
        header: salesLabels.carrier,
        size: 120,
        cell: ({ row }) => row.original.carrier || "-",
      },
      {
        accessorKey: "status",
        header: formLabels.status,
        size: 110,
        cell: ({ row }) => getStatusBadge(row.original.status),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        size: 80,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-right">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${basePath}/${row.original.id}`}>
                <Eye className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [basePath],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderMobileView = (orders: any[]) => (
    <>
      {orders.length === 0 ? (
        <div className="text-center p-4 text-muted-foreground border rounded-lg border-dashed">
          {salesLabels.emptyDeliveries}
        </div>
      ) : (
        orders.map((order) => (
          <Card
            key={order.id}
            className="overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
            onClick={() => router.push(`${basePath}/${order.id}`)}
          >
            <CardHeader className="p-4 pb-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="bg-primary/10 p-1.5 rounded-full">
                    <Truck className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">
                      {order.orderNumber}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(order.deliveryDate), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
                {getStatusBadge(order.status)}
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                      {salesLabels.customer}
                    </p>
                    <p className="font-medium truncate">
                      {order.salesOrder?.customer?.name || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                      {salesLabels.salesOrder}
                    </p>
                    <Link
                      href={`/sales/orders/${order.salesOrderId}`}
                      className="font-medium text-blue-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {order.salesOrder?.orderNumber || "-"}
                    </Link>
                  </div>
                </div>
                {order.carrier && (
                  <div className="text-xs text-muted-foreground">
                    Ekspedisi: {order.carrier}
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
                  <span>{order.sourceLocation?.name || "-"}</span>
                  <div className="flex items-center text-primary font-medium">
                    Lihat Detail <ChevronRight className="h-3 w-3 ml-0.5" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </>
  );

  return (
    <DataTable
      columns={columns}
      data={initialData}
      emptyMessage={salesLabels.emptyDeliveries}
      minWidth={900}
      renderMobileView={renderMobileView}
    />
  );
}
