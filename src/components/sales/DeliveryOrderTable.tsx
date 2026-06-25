"use client";

import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Eye } from "lucide-react";
import Link from "next/link";
import { salesLabels, formLabels, getStatusLabel } from "@/lib/labels";

interface DeliveryOrderTableProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialData: any[];
}

export function DeliveryOrderTable({ initialData }: DeliveryOrderTableProps) {
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PENDING: "bg-yellow-100 text-yellow-800",
      SHIPPED: "bg-blue-100 text-blue-800",
      DELIVERED: "bg-green-100 text-green-800",
      RETURNED: "bg-red-100 text-red-800",
      CANCELLED: "bg-gray-100 text-gray-800",
    };
    return (
      <Badge variant="secondary" className={styles[status] || styles.PENDING}>
        {getStatusLabel(status, "sales")}
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
              <Link href={`/sales/deliveries/${row.original.id}`}>
                <Eye className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={initialData}
      emptyMessage={salesLabels.emptyDeliveries}
      minWidth={900}
    />
  );
}
