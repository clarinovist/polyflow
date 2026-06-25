"use client";

import { useState, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/utils/utils";
import { format } from "date-fns";
import { ArrowRight, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { salesLabels, formLabels, getStatusLabel } from "@/lib/labels";
import { InvoiceStatus } from "@prisma/client";
import { deleteInvoice } from "@/actions/finance/invoices";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date | string;
  dueDate?: Date | string | null;
  totalAmount: number;
  paidAmount: number;
  status: InvoiceStatus;
  salesOrderId?: string | null;
  purchaseOrderId?: string | null;
  salesOrder?: {
    orderNumber: string;
    customer: { name: string } | null;
  } | null;
  purchaseOrder?: {
    orderNumber: string;
    supplier: { name: string } | null;
  } | null;
}

interface InvoiceTableProps {
  invoices: InvoiceData[];
  basePath?: string;
}

export function InvoiceTable({
  invoices,
  basePath = "/sales/orders",
}: InvoiceTableProps) {
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string, type: "AR" | "AP") => {
    setIsDeleting(id);
    try {
      const result = await deleteInvoice(id, type);
      if (result.success) {
        toast.success("Invoice berhasil dihapus");
      } else {
        toast.error(
          result.error || "Gagal menghapus invoice. Silakan coba lagi.",
        );
      }
    } catch (error) {
      console.error(error);
      toast.error("Terjadi kesalahan yang tidak terduga. Silakan coba lagi.");
    } finally {
      setIsDeleting(null);
    }
  };

  const getStatusBadge = (status: InvoiceStatus) => {
    const styles: Record<string, string> = {
      UNPAID: "bg-slate-100 text-slate-800",
      PAID: "bg-emerald-100 text-emerald-800",
      PARTIAL: "bg-amber-100 text-amber-800",
      OVERDUE: "bg-red-100 text-red-800 border-red-200",
      CANCELLED: "bg-red-50 text-red-500",
    };
    return (
      <Badge variant="secondary" className={styles[status] || styles.UNPAID}>
        {getStatusLabel(status, "finance")}
      </Badge>
    );
  };

  const columns: ColumnDef<InvoiceData, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "invoiceNumber",
        header: `No. ${salesLabels.invoice}`,
        size: 150,
      },
      {
        accessorKey: "invoiceDate",
        header: formLabels.date,
        size: 120,
        sortingFn: "datetime",
        cell: ({ row }) => format(new Date(row.original.invoiceDate), "PP"),
      },
      {
        id: "dueDate",
        header: salesLabels.dueDate,
        size: 120,
        sortingFn: "datetime",
        accessorFn: (row) =>
          row.dueDate ? new Date(row.dueDate).getTime() : 0,
        cell: ({ row }) => {
          const { dueDate, status } = row.original;
          return (
            <span
              className={
                status === ("OVERDUE" as InvoiceStatus)
                  ? "text-red-600 font-bold"
                  : ""
              }
            >
              {dueDate ? format(new Date(dueDate), "PP") : "-"}
            </span>
          );
        },
      },
      {
        id: "entity",
        header: "Entitas",
        size: 180,
        accessorFn: (row) =>
          row.salesOrder?.customer?.name ||
          row.purchaseOrder?.supplier?.name ||
          "",
        cell: ({ row }) => {
          const { salesOrder, purchaseOrder } = row.original;
          return (
            salesOrder?.customer?.name ||
            purchaseOrder?.supplier?.name ||
            "Legacy Internal Stock Build"
          );
        },
      },
      {
        id: "orderReference",
        header: "Order Referensi",
        size: 150,
        accessorFn: (row) =>
          row.salesOrder?.orderNumber || row.purchaseOrder?.orderNumber || "",
        cell: ({ row }) => {
          const {
            salesOrder,
            purchaseOrder,
            salesOrderId,
            purchaseOrderId,
            id,
          } = row.original;
          const orderNumber =
            salesOrder?.orderNumber || purchaseOrder?.orderNumber || "-";
          const linkId = basePath.includes("finance")
            ? id
            : salesOrderId || purchaseOrderId || id;
          return (
            <Link
              href={`${basePath}/${linkId}`}
              className="text-blue-600 hover:underline"
            >
              {orderNumber}
            </Link>
          );
        },
      },
      {
        accessorKey: "status",
        header: formLabels.status,
        size: 120,
        cell: ({ row }) => getStatusBadge(row.original.status),
      },
      {
        accessorKey: "totalAmount",
        header: () => <div className="text-right">{formLabels.total}</div>,
        size: 150,
        cell: ({ row }) => (
          <div className="text-right font-medium">
            {formatRupiah(Number(row.original.totalAmount))}
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        size: 100,
        enableSorting: false,
        cell: ({ row }) => {
          const invoice = row.original;
          const isAR = !!invoice.salesOrder;
          const linkId = basePath.includes("finance")
            ? invoice.id
            : invoice.salesOrderId || invoice.purchaseOrderId || invoice.id;
          return (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" asChild title="Lihat Detail">
                <Link href={`${basePath}/${linkId}`}>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={isDeleting === invoice.id}
                    title="Delete/Void"
                  >
                    {isDeleting === invoice.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Apakah Anda benar-benar yakin?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Tindakan ini akan menghapus invoice secara permanen{" "}
                      <strong>{invoice.invoiceNumber}</strong> beserta jurnal
                      akuntansinya dari buku besar. Tindakan ini tidak dapat
                      dibatalkan.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        handleDelete(invoice.id, isAR ? "AR" : "AP")
                      }
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Hapus Invoice & Jurnal
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          );
        },
      },
    ],
    [basePath, isDeleting],
  );

  return (
    <DataTable
      columns={columns}
      data={invoices}
      emptyMessage={salesLabels.emptyInvoices}
      minWidth={900}
    />
  );
}
