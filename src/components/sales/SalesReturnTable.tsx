"use client";

import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { getStatusLabel, salesLabels, formLabels } from "@/lib/labels";
import { formatRupiah } from "@/lib/utils/utils";
import { format } from "date-fns";
import { SalesReturn, SalesReturnStatus, Customer } from "@prisma/client";
import { RotateCcw, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";

type SerializedSalesReturn = Omit<SalesReturn, "totalAmount"> & {
  totalAmount: number | null;
  customer:
    | (Omit<Customer, "creditLimit" | "discountPercent"> & {
        creditLimit: number | null;
        discountPercent: number | null;
      })
    | null;
  salesOrder: { orderNumber: string } | null;
  _count: { items: number };
};

interface SalesReturnTableProps {
  initialData: SerializedSalesReturn[];
  basePath?: string;
}

export function SalesReturnTable({
  initialData,
  basePath = "/sales/returns",
}: SalesReturnTableProps) {
  const router = useRouter();

  const getStatusColor = (status: SalesReturnStatus) => {
    switch (status) {
      case "DRAFT":
        return "bg-slate-100 text-slate-800 border-slate-200";
      case "CONFIRMED":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "RECEIVED":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "COMPLETED":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "CANCELLED":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-slate-100 text-slate-800";
    }
  };

  const columns: ColumnDef<SerializedSalesReturn, unknown>[] = useMemo(
    () => [
      {
        id: "returnNumber",
        header: salesLabels.returnNumber,
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
        header: "Ref SO",
        size: 130,
        accessorFn: (row) => row.salesOrder?.orderNumber || "",
        cell: ({ row }) => row.original.salesOrder?.orderNumber || "-",
      },
      {
        id: "customer",
        header: salesLabels.customer,
        size: 180,
        accessorFn: (row) => row.customer?.name || "",
        cell: ({ row }) => row.original.customer?.name || "-",
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
            {getStatusLabel(row.original.status, "sales")}
          </Badge>
        ),
      },
      {
        id: "itemCount",
        header: () => <div className="text-right">{salesLabels.items}</div>,
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
        header: () => <div className="text-right">Total Keseluruhan</div>,
        size: 150,
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

  const renderMobileView = (returns: SerializedSalesReturn[]) => (
    <>
      {returns.length === 0 ? (
        <div className="text-center p-4 text-muted-foreground border rounded-lg border-dashed">
          {salesLabels.emptyReturns}
        </div>
      ) : (
        returns.map((sr) => (
          <Card
            key={sr.id}
            className="overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
            onClick={() => router.push(`${basePath}/${sr.id}`)}
          >
            <CardHeader className="p-4 pb-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="bg-primary/10 p-1.5 rounded-full">
                    <RotateCcw className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{sr.returnNumber}</h3>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(sr.returnDate), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={`text-[10px] px-1.5 h-5 ${getStatusColor(sr.status)}`}
                >
                  {getStatusLabel(sr.status, "sales")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                      {salesLabels.customer}
                    </p>
                    <p className="font-medium truncate">
                      {sr.customer?.name || "-"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Total Keseluruhan
                    </p>
                    <p className="font-semibold text-primary">
                      {sr.totalAmount
                        ? formatRupiah(Number(sr.totalAmount))
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
                      SO: {sr.salesOrder?.orderNumber || "-"}
                    </Badge>
                    <span>
                      • {sr._count.items} {salesLabels.items}
                    </span>
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
        emptyMessage={salesLabels.emptyReturns}
        minWidth={900}
        renderMobileView={renderMobileView}
      />
    </div>
  );
}
