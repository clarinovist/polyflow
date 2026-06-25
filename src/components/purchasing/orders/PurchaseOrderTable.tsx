"use client";

import { useState, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Eye } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { formatRupiah } from "@/lib/utils/utils";
import { PurchaseOrderStatus } from "@prisma/client";
import { getStatusLabel, purchasingLabels, formLabels } from "@/lib/labels";

type POWithRelations = {
  id: string;
  orderNumber: string;
  orderDate: Date;
  expectedDate: Date | null;
  status: PurchaseOrderStatus;
  totalAmount: number | null;
  supplier: {
    name: string;
    code: string | null;
  };
  _count: {
    items: number;
  };
};

interface PurchaseOrderTableProps {
  orders: POWithRelations[];
}

export function PurchaseOrderTable({ orders }: PurchaseOrderTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.supplier.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "all" || order.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  const getStatusBadge = (status: PurchaseOrderStatus) => {
    switch (status) {
      case "DRAFT":
        return (
          <Badge
            variant="outline"
            className="bg-slate-100 text-slate-700 border-slate-200"
          >
            {getStatusLabel("DRAFT", "purchasing")}
          </Badge>
        );
      case "SENT":
        return (
          <Badge
            variant="outline"
            className="bg-blue-100 text-blue-700 border-blue-200"
          >
            {getStatusLabel("SENT", "purchasing")}
          </Badge>
        );
      case "PARTIAL_RECEIVED":
        return (
          <Badge
            variant="outline"
            className="bg-amber-100 text-amber-700 border-amber-200"
          >
            {getStatusLabel("PARTIAL_RECEIVED", "purchasing")}
          </Badge>
        );
      case "RECEIVED":
        return (
          <Badge
            variant="outline"
            className="bg-emerald-100 text-emerald-700 border-emerald-200"
          >
            {getStatusLabel("RECEIVED", "purchasing")}
          </Badge>
        );
      case "CANCELLED":
        return (
          <Badge variant="destructive">
            {getStatusLabel("CANCELLED", "purchasing")}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {getStatusLabel(status, "purchasing")}
          </Badge>
        );
    }
  };

  const columns: ColumnDef<POWithRelations, unknown>[] = useMemo(
    () => [
      {
        id: "orderNumber",
        header: purchasingLabels.poNumber,
        size: 150,
        accessorFn: (row) => row.orderNumber,
        cell: ({ row }) => (
          <span className="font-mono font-medium text-blue-600">
            <Link
              href={`/purchasing/orders/${row.original.id}`}
              className="hover:underline"
            >
              {row.original.orderNumber}
            </Link>
          </span>
        ),
      },
      {
        id: "supplier",
        header: purchasingLabels.supplier,
        size: 180,
        accessorFn: (row) => row.supplier.name,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.supplier.name}</span>
            {row.original.supplier.code && (
              <span className="text-[10px] text-muted-foreground uppercase">
                {row.original.supplier.code}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "orderDate",
        header: purchasingLabels.poDate,
        size: 120,
        sortingFn: "datetime",
        cell: ({ row }) => (
          <span className="text-sm">
            {format(new Date(row.original.orderDate), "dd MMM yyyy")}
          </span>
        ),
      },
      {
        accessorKey: "expectedDate",
        header: "Estimasi Pengiriman",
        size: 140,
        sortingFn: "datetime",
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.expectedDate
              ? format(new Date(row.original.expectedDate), "dd MMM yyyy")
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "totalAmount",
        header: () => <div className="text-right">Total Keseluruhan</div>,
        size: 160,
        cell: ({ row }) => (
          <div className="text-right font-medium tabular-nums">
            {formatRupiah(row.original.totalAmount || 0)}
          </div>
        ),
      },
      {
        id: "itemCount",
        header: () => (
          <div className="text-center">{purchasingLabels.itemsCount}</div>
        ),
        size: 80,
        accessorFn: (row) => row._count.items,
        cell: ({ row }) => (
          <div className="text-center">
            <Badge variant="secondary" className="font-normal">
              {row.original._count.items} item
            </Badge>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: formLabels.status,
        size: 130,
        cell: ({ row }) => getStatusBadge(row.original.status),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        size: 80,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-right">
            <Link href={`/purchasing/orders/${row.original.id}`}>
              <Button variant="ghost" size="sm">
                <Eye className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={filteredOrders}
      emptyMessage={purchasingLabels.emptyOrders}
      minWidth={1000}
    >
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari No. PO atau supplier..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 w-[250px]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 w-[150px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">Semua Status</option>
          {Object.values(PurchaseOrderStatus).map((status) => (
            <option key={status} value={status}>
              {getStatusLabel(status, "purchasing")}
            </option>
          ))}
        </select>
        <Link href="/purchasing/orders/create">
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" />
            Buat PO
          </Button>
        </Link>
      </div>
    </DataTable>
  );
}
