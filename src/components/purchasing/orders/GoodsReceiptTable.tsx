"use client";

import { useState, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, MapPin, User, Building2 } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getStatusLabel, purchasingLabels } from "@/lib/labels";

type ReceiptWithRelations = {
  id: string;
  receiptNumber: string;
  receivedDate: Date;
  notes: string | null;
  isMaklon: boolean;
  purchaseOrder: {
    orderNumber: string;
    status: string;
    supplier: { name: string };
  } | null;
  customer: {
    name: string;
  } | null;
  items: {
    id: string;
    receivedQty: number;
    productVariant: {
      name: string;
      skuCode: string;
      primaryUnit: string;
    };
  }[];
  location: {
    name: string;
  };
  createdBy: {
    name: string;
  };
  _count: {
    items: number;
  };
};

interface GoodsReceiptTableProps {
  receipts: ReceiptWithRelations[];
  basePath?: string;
}

export function GoodsReceiptTable({
  receipts,
  basePath = "/warehouse/incoming",
}: GoodsReceiptTableProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      const search = searchTerm.toLowerCase();
      const poMatch = r.purchaseOrder
        ? r.purchaseOrder.orderNumber.toLowerCase().includes(search) ||
          r.purchaseOrder.supplier.name.toLowerCase().includes(search)
        : false;
      const maklonMatch = r.customer
        ? r.customer.name.toLowerCase().includes(search)
        : false;
      return (
        r.receiptNumber.toLowerCase().includes(search) || poMatch || maklonMatch
      );
    });
  }, [receipts, searchTerm]);

  const columns: ColumnDef<ReceiptWithRelations, unknown>[] = useMemo(
    () => [
      {
        id: "receiptNumber",
        header: purchasingLabels.grNumber,
        size: 160,
        accessorFn: (row) => row.receiptNumber,
        sortingFn: (a, b) =>
          new Date(a.original.receivedDate).getTime() -
          new Date(b.original.receivedDate).getTime(),
        cell: ({ row }) => (
          <div>
            <Link
              href={`${basePath}/${row.original.id}`}
              className="font-mono font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              {row.original.receiptNumber}
            </Link>
            <div className="text-xs text-muted-foreground mt-0.5">
              {format(new Date(row.original.receivedDate), "dd MMM yyyy")}
            </div>
          </div>
        ),
      },
      {
        id: "entity",
        header: "Supplier / Customer",
        size: 240,
        accessorFn: (row) =>
          row.purchaseOrder?.supplier.name || row.customer?.name || "",
        cell: ({ row }) => {
          const { purchaseOrder, customer } = row.original;
          const name = purchaseOrder
            ? purchaseOrder.supplier.name
            : customer?.name || "Maklon Tidak Diketahui";
          return (
            <div className="min-w-0">
              <div
                className="flex items-center gap-1.5 font-medium text-sm truncate"
                title={name}
              >
                {purchaseOrder ? (
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="truncate">{name}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs">
                {purchaseOrder ? (
                  <>
                    <Badge
                      variant="outline"
                      className="border-blue-500/20 text-blue-600 dark:text-blue-400 bg-blue-500/10 text-[10px] px-1.5 h-4 font-normal shrink-0"
                    >
                      PO: {purchaseOrder.orderNumber}
                    </Badge>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {getStatusLabel(purchaseOrder.status, "purchasing")}
                    </span>
                  </>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-purple-500/20 text-purple-600 dark:text-purple-400 bg-purple-500/10 text-[10px] px-1.5 h-4 font-normal"
                  >
                    Maklon
                  </Badge>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: "location",
        header: "Lokasi",
        size: 140,
        accessorFn: (row) => row.location.name,
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{row.original.location.name}</span>
          </div>
        ),
      },
      {
        id: "items",
        header: "Item",
        size: 100,
        accessorFn: (row) => row._count.items,
        cell: ({ row }) => {
          const gr = row.original;
          return (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-auto p-0 hover:bg-transparent"
                >
                  <Badge
                    variant="secondary"
                    className="font-normal cursor-pointer hover:bg-muted-foreground/20"
                  >
                    {gr._count.items} item
                  </Badge>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <div className="p-4 space-y-3">
                  <div className="space-y-1">
                    <h4 className="font-medium leading-none">Item Diterima</h4>
                    <p className="text-xs text-muted-foreground">
                      Daftar item untuk penerimaan {gr.receiptNumber}
                    </p>
                  </div>
                  <div className="grid gap-3">
                    {gr.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex justify-between items-start text-sm border-b pb-2 last:border-0 last:pb-0"
                      >
                        <div>
                          <span className="block font-medium">
                            {item.productVariant.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {item.productVariant.skuCode}
                          </span>
                        </div>
                        <div className="text-right whitespace-nowrap font-medium">
                          {item.receivedQty} {item.productVariant.primaryUnit}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          );
        },
      },
    ],
    [basePath],
  );

  return (
    <DataTable
      columns={columns}
      data={filteredReceipts}
      emptyMessage={purchasingLabels.emptyReceipts}
      minWidth={750}
    >
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari No. Penerimaan, PO, atau customer..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>
    </DataTable>
  );
}
