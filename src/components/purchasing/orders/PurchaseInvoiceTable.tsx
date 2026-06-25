"use client";

import { useState, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Calendar, Trash2, Loader2, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { formatRupiah } from "@/lib/utils/utils";
import {
  getStatusLabel,
  purchasingLabels,
  formLabels,
  actionLabels,
} from "@/lib/labels";
import { PurchaseInvoiceStatus } from "@prisma/client";
import Link from "next/link";
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

type InvoiceWithRelations = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  status: PurchaseInvoiceStatus;
  totalAmount: number;
  paidAmount: number;
  purchaseOrderId: string;
  purchaseOrder: {
    id: string;
    orderNumber: string;
    supplier: {
      name: string;
    };
  };
};

interface PurchaseInvoiceTableProps {
  invoices: InvoiceWithRelations[];
  basePath?: string;
}

export function PurchaseInvoiceTable({
  invoices,
  basePath = "/purchasing/orders",
}: PurchaseInvoiceTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setIsDeleting(id);
    try {
      const result = await deleteInvoice(id, "AP");
      if (result.success) {
        toast.success("Invoice Pembelian berhasil dihapus");
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

  const filteredInvoices = useMemo(() => {
    return invoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.purchaseOrder.orderNumber
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        inv.purchaseOrder.supplier.name
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
    );
  }, [invoices, searchTerm]);

  const getStatusBadge = (status: PurchaseInvoiceStatus) => {
    const styles: Record<string, string> = {
      UNPAID:
        "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900",
      PARTIAL:
        "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900",
      PAID: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900",
      OVERDUE:
        "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900",
      CANCELLED: "bg-red-50 text-red-500",
      DRAFT: "bg-slate-100 text-slate-800",
    };
    return (
      <Badge variant="outline" className={styles[status]}>
        {getStatusLabel(status, "purchasing")}
      </Badge>
    );
  };

  const columns: ColumnDef<InvoiceWithRelations, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "invoiceNumber",
        header: purchasingLabels.invoiceNumber,
        size: 150,
        cell: ({ row }) => (
          <Link
            href={`${basePath}/${basePath.includes("finance") ? row.original.id : row.original.purchaseOrder.id}`}
            className="font-mono font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
          >
            {row.original.invoiceNumber}
          </Link>
        ),
      },
      {
        id: "supplier",
        header: purchasingLabels.supplier,
        size: 180,
        accessorFn: (row) => row.purchaseOrder.supplier.name,
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.purchaseOrder.supplier.name}
          </span>
        ),
      },
      {
        id: "orderNumber",
        header: "Referensi PO",
        size: 130,
        accessorFn: (row) => row.purchaseOrder.orderNumber,
        cell: ({ row }) => (
          <Badge variant="secondary" className="font-mono text-[10px]">
            {row.original.purchaseOrder.orderNumber}
          </Badge>
        ),
      },
      {
        accessorKey: "invoiceDate",
        header: purchasingLabels.invoiceDate,
        size: 120,
        sortingFn: "datetime",
        cell: ({ row }) => (
          <span className="text-sm">
            {format(new Date(row.original.invoiceDate), "dd MMM yyyy")}
          </span>
        ),
      },
      {
        accessorKey: "dueDate",
        header: formLabels.dueDate,
        size: 130,
        sortingFn: "datetime",
        cell: ({ row }) => {
          const { dueDate, status } = row.original;
          const isOverdue =
            dueDate && new Date(dueDate) < new Date() && status !== "PAID";
          return (
            <div
              className={`flex items-center gap-2 text-sm ${isOverdue ? "text-red-600 font-bold" : ""}`}
            >
              <Calendar className="h-3 w-3" />
              {dueDate ? format(new Date(dueDate), "dd MMM yyyy") : "-"}
            </div>
          );
        },
      },
      {
        accessorKey: "totalAmount",
        header: () => <div className="text-right">Total Keseluruhan</div>,
        size: 150,
        cell: ({ row }) => (
          <div className="text-right font-medium">
            {formatRupiah(row.original.totalAmount)}
          </div>
        ),
      },
      {
        accessorKey: "paidAmount",
        header: () => <div className="text-right">Jumlah Dibayar</div>,
        size: 140,
        cell: ({ row }) => (
          <div className="text-right text-emerald-600 dark:text-emerald-400 font-medium">
            {formatRupiah(row.original.paidAmount)}
          </div>
        ),
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
        size: 100,
        enableSorting: false,
        cell: ({ row }) => {
          const inv = row.original;
          return (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" asChild title="Lihat Detail">
                <Link
                  href={`${basePath}/${basePath.includes("finance") ? inv.id : inv.purchaseOrder.id}`}
                >
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={isDeleting === inv.id}
                    title="Hapus/Batal"
                  >
                    {isDeleting === inv.id ? (
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
                      Tindakan ini akan menghapus invoice pembelian{" "}
                      <strong>{inv.invoiceNumber}</strong> secara permanen
                      beserta jurnal akuntansi terkait dari buku besar. Tindakan
                      ini tidak dapat dibatalkan.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{actionLabels.cancel}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDelete(inv.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Hapus Tagihan & Jurnal
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
      data={filteredInvoices}
      emptyMessage={purchasingLabels.emptyInvoices}
      minWidth={1000}
    >
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari invoice, PO, atau supplier..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>
    </DataTable>
  );
}
