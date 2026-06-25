"use client";

import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/utils/utils";
import { format } from "date-fns";
import { PurchaseReturn, PurchaseReturnStatus, Supplier } from "@prisma/client";
import { RotateCcw, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { getStatusLabel, purchasingLabels, formLabels } from "@/lib/labels";

type SerializedPurchaseReturn = Omit<PurchaseReturn, "totalAmount"> & {
  totalAmount: number | null;
  supplier: Supplier | null;
  purchaseOrder: { orderNumber: string } | null;
  _count: { items: number };
};

interface PurchaseReturnTableProps {
  initialData: SerializedPurchaseReturn[];
  basePath?: string;
}

export function PurchaseReturnTable({
  initialData,
  basePath = "/purchasing/returns",
}: PurchaseReturnTableProps) {
  const router = useRouter();

  const getStatusColor = (status: PurchaseReturnStatus) => {
    switch (status) {
      case "DRAFT":
        return "bg-slate-100 text-slate-800 border-slate-200";
      case "CONFIRMED":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "SHIPPED":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "COMPLETED":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "CANCELLED":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-slate-100 text-slate-800";
    }
  };

  const columns: ColumnDef<SerializedPurchaseReturn, unknown>[] = useMemo(
    () => [
      {
        id: "returnNumber",
        header: purchasingLabels.returnNumber,
        size: 160,
        accessorFn: (row) => row.returnNumber,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{row.original.returnNumber}</span>
          </div>
        ),
      },
      {
        accessorKey: "returnDate",
        header: formLabels.date,
        size: 120,
        sortingFn: "datetime",
        cell: ({ row }) =>
          format(new Date(row.original.returnDate), "MMM d, yyyy"),
      },
      {
        id: "orderRef",
        header: "Referensi PO",
        size: 130,
        accessorFn: (row) => row.purchaseOrder?.orderNumber || "",
        cell: ({ row }) => row.original.purchaseOrder?.orderNumber || "-",
      },
      {
        id: "supplier",
        header: purchasingLabels.supplier,
        size: 180,
        accessorFn: (row) => row.supplier?.name || "",
        cell: ({ row }) => row.original.supplier?.name || "-",
      },
      {
        accessorKey: "status",
        header: formLabels.status,
        size: 120,
        cell: ({ row }) => (
          <Badge
            variant="secondary"
            className={getStatusColor(row.original.status)}
          >
            {getStatusLabel(row.original.status, "purchasing")}
          </Badge>
        ),
      },
      {
        id: "itemCount",
        header: () => <div className="text-right">Item</div>,
        size: 80,
        accessorFn: (row) => row._count.items,
        cell: ({ row }) => (
          <div className="text-right text-muted-foreground">
            {row.original._count.items}
          </div>
        ),
      },
      {
        accessorKey: "totalAmount",
        header: () => <div className="text-right">Total</div>,
        size: 140,
        cell: ({ row }) => (
          <div className="text-right font-medium">
            {row.original.totalAmount
              ? formatRupiah(Number(row.original.totalAmount))
              : "-"}
          </div>
        ),
      },
    ],
    [],
  );

  const renderMobileView = (returns: SerializedPurchaseReturn[]) => (
    <>
      {returns.length === 0 ? (
        <div className="text-center p-4 text-muted-foreground border rounded-lg border-dashed">
          {purchasingLabels.emptyReturns}
        </div>
      ) : (
        returns.map((pr) => (
          <Card
            key={pr.id}
            className="overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
            onClick={() => router.push(`${basePath}/${pr.id}`)}
          >
            <CardHeader className="p-4 pb-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="bg-primary/10 p-1.5 rounded-full">
                    <RotateCcw className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{pr.returnNumber}</h3>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(pr.returnDate), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={`text-[10px] px-1.5 h-5 ${getStatusColor(pr.status)}`}
                >
                  {getStatusLabel(pr.status, "purchasing")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                      {purchasingLabels.supplier}
                    </p>
                    <p className="font-medium truncate">
                      {pr.supplier?.name || "-"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Total
                    </p>
                    <p className="font-semibold text-primary">
                      {pr.totalAmount
                        ? formatRupiah(Number(pr.totalAmount))
                        : "-"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground text-[11px]">
                  <div className="flex items-center gap-1">
                    <Badge
                      variant="outline"
                      className="h-4 px-1 rounded-sm text-[9px] font-normal"
                    >
                      PO: {pr.purchaseOrder?.orderNumber || "-"}
                    </Badge>
                    <span>• {pr._count.items} Item</span>
                  </div>
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
    <div className="rounded-md border-none sm:border">
      <DataTable
        columns={columns}
        data={initialData}
        emptyMessage={purchasingLabels.emptyReturns}
        minWidth={900}
        renderMobileView={renderMobileView}
      />
    </div>
  );
}
