"use client";

import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/utils/utils";
import { format } from "date-fns";
import { SalesQuotation, SalesQuotationStatus, Customer } from "@prisma/client";
import { FileText, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { salesLabels, formLabels, getStatusLabel } from "@/lib/labels";

type SerializedSalesQuotation = Omit<SalesQuotation, "totalAmount"> & {
  totalAmount: number | null;
  customer: Customer | null;
  _count: { items: number };
};

interface SalesQuotationTableProps {
  initialData: SerializedSalesQuotation[];
  basePath?: string;
}

export function SalesQuotationTable({
  initialData,
  basePath = "/sales/quotations",
}: SalesQuotationTableProps) {
  const router = useRouter();
  const columns: ColumnDef<SerializedSalesQuotation, unknown>[] =
    useMemo(() => {
      const getStatusColor = (status: SalesQuotationStatus) => {
        switch (status) {
          case "DRAFT":
            return "bg-slate-100 text-slate-800 border-slate-200";
          case "SENT":
            return "bg-blue-100 text-blue-800 border-blue-200";
          case "ACCEPTED":
            return "bg-emerald-100 text-emerald-800 border-emerald-200";
          case "REJECTED":
            return "bg-red-100 text-red-800 border-red-200";
          case "EXPIRED":
            return "bg-amber-100 text-amber-800 border-amber-200";
          case "CONVERTED":
            return "bg-purple-100 text-purple-800 border-purple-200";
          default:
            return "bg-slate-100 text-slate-800";
        }
      };

      return [
        {
          id: "quotationNumber",
          header: salesLabels.quotationNumber,
          size: 160,
          accessorFn: (row) => row.quotationNumber,
          cell: ({ row }) => (
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {row.original.quotationNumber}
              </span>
            </div>
          ),
        },
        {
          accessorKey: "quotationDate",
          header: formLabels.date,
          size: 120,
          sortingFn: "datetime",
          cell: ({ row }) =>
            format(new Date(row.original.quotationDate), "MMM d, yyyy"),
        },
        {
          accessorKey: "validUntil",
          header: salesLabels.validUntil,
          size: 120,
          sortingFn: "datetime",
          cell: ({ row }) =>
            row.original.validUntil
              ? format(new Date(row.original.validUntil), "MMM d, yyyy")
              : "-",
        },
        {
          id: "customer",
          header: salesLabels.customer,
          size: 180,
          accessorFn: (row) => row.customer?.name || "",
          cell: ({ row }) => row.original.customer?.name || "Prospect",
        },
        {
          accessorKey: "status",
          header: formLabels.status,
          size: 110,
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
          header: () => <div className="text-right">{formLabels.total}</div>,
          size: 150,
          cell: ({ row }) => (
            <div className="text-right font-medium">
              {row.original.totalAmount
                ? formatRupiah(Number(row.original.totalAmount))
                : "-"}
            </div>
          ),
        },
      ];
    }, []);

  const getStatusColor = (status: SalesQuotationStatus) => {
    switch (status) {
      case "DRAFT":
        return "bg-slate-100 text-slate-800 border-slate-200";
      case "SENT":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "ACCEPTED":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "REJECTED":
        return "bg-red-100 text-red-800 border-red-200";
      case "EXPIRED":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "CONVERTED":
        return "bg-purple-100 text-purple-800 border-purple-200";
      default:
        return "bg-slate-100 text-slate-800";
    }
  };

  const renderMobileView = (quotations: SerializedSalesQuotation[]) => (
    <>
      {quotations.length === 0 ? (
        <div className="text-center p-4 text-muted-foreground border rounded-lg border-dashed">
          {salesLabels.emptyQuotations}
        </div>
      ) : (
        quotations.map((q) => (
          <Card
            key={q.id}
            className="overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
            onClick={() => router.push(`${basePath}/${q.id}`)}
          >
            <CardHeader className="p-4 pb-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="bg-primary/10 p-1.5 rounded-full">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">
                      {q.quotationNumber}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(q.quotationDate), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={`text-[10px] px-1.5 h-5 ${getStatusColor(q.status)}`}
                >
                  {getStatusLabel(q.status, "sales")}
                </Badge>
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
                      {q.customer?.name || "Prospect"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                      {formLabels.total}
                    </p>
                    <p className="font-semibold text-primary">
                      {q.totalAmount
                        ? formatRupiah(Number(q.totalAmount))
                        : "-"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    {q.validUntil && (
                      <span>
                        Berlaku hingga{" "}
                        {format(new Date(q.validUntil), "MMM d, yyyy")}
                      </span>
                    )}
                    <span>• {q._count.items} item</span>
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
    <DataTable
      columns={columns}
      data={initialData}
      emptyMessage={salesLabels.emptyQuotations}
      minWidth={900}
      renderMobileView={renderMobileView}
    />
  );
}
