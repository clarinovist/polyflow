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
        size: 160,
        accessorFn: (row) => row.orderNumber,
        sortingFn: (a, b) =>
          new Date(a.original.orderDate).getTime() -
          new Date(b.original.orderDate).getTime(),
        cell: ({ row }) => {
          const po = row.original;
          return (
            <div>
              <Link
                href={`/purchasing/orders/${po.id}`}
                className="font-mono font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {po.orderNumber}
              </Link>
              <div className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(po.orderDate), "dd MMM yyyy")}
              </div>
              {po.expectedDate && (
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  ETA: {format(new Date(po.expectedDate), "dd MMM yyyy")}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "supplier",
        header: purchasingLabels.supplier,
        size: 200,
        accessorFn: (row) => row.supplier.name,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div
              className="font-medium truncate"
              title={row.original.supplier.name}
            >
              {row.original.supplier.name}
            </div>
            {row.original.supplier.code && (
              <span className="text-[10px] text-muted-foreground uppercase block mt-0.5">
                {row.original.supplier.code}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: formLabels.status,
        size: 140,
        cell: ({ row }) => getStatusBadge(row.original.status),
      },
      {
        accessorKey: "totalAmount",
        header: () => <div className="text-right">Total</div>,
        size: 150,
        cell: ({ row }) => (
          <div className="text-right">
            <div className="font-medium tabular-nums">
              {formatRupiah(row.original.totalAmount || 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {row.original._count.items} item
            </div>
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        size: 80,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-right">
            <Link href={`/purchasing/orders/${row.original.id}`}>
              <Button variant="ghost" size="sm" title="Lihat Detail">
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
      minWidth={780}
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
