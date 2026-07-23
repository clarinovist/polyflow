"use client";

import { useState, useMemo, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { isInvoiceOverdue } from "@/lib/purchasing/payment-terms";

type InvoiceWithRelations = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | string | null;
  status: PurchaseInvoiceStatus;
  totalAmount: number;
  paidAmount: number;
  termOfPaymentDays?: number | null;
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
  initialStatus?: string;
  overdueMode?: boolean;
}

export function PurchaseInvoiceTable({
  invoices,
  basePath = "/purchasing/orders",
  initialStatus,
  overdueMode,
}: PurchaseInvoiceTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus || "ALL");

  useEffect(() => {
    if (initialStatus) setStatusFilter(initialStatus);
  }, [initialStatus]);

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
      toast.error("Gagal memproses invoice. Silakan coba lagi.");
    } finally {
      setIsDeleting(null);
    }
  };

  const filteredInvoices = useMemo(() => {
    const now = new Date();
    return invoices.filter((inv) => {
      // 1. Overdue mode: match board definition (dueDate < now + remaining > 0 + UNPAID/PARTIAL/OVERDUE)
      if (overdueMode) {
        const remaining = (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0);
        const overdueStatuses: string[] = ['UNPAID', 'PARTIAL', 'OVERDUE'];
        if (!inv.dueDate || new Date(inv.dueDate as unknown as string) >= now || remaining <= 0 || !overdueStatuses.includes(inv.status)) {
          return false;
        }
      } else if (statusFilter !== "ALL" && inv.status !== statusFilter) {
        return false;
      }

      // 2. Filter by search term
      const lowerSearch = searchTerm.toLowerCase();
      return (
        inv.invoiceNumber.toLowerCase().includes(lowerSearch) ||
        inv.purchaseOrder.orderNumber.toLowerCase().includes(lowerSearch) ||
        inv.purchaseOrder.supplier.name.toLowerCase().includes(lowerSearch)
      );
    });
  }, [invoices, searchTerm, statusFilter, overdueMode]);

  const getStatusBadge = (inv: InvoiceWithRelations) => {
    const status = inv.status;
    const overdue = isInvoiceOverdue(inv.dueDate, status);
    // UNPAID yang belum lewat tempo jangan merah
    const styles: Record<string, string> = {
      UNPAID: overdue
        ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900"
        : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
      PARTIAL:
        "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900",
      PAID: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900",
      OVERDUE:
        "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900",
      CANCELLED: "bg-red-50 text-red-500",
      DRAFT: "bg-slate-100 text-slate-800",
    };
    return (
      <Badge variant="outline" className={styles[status] ?? styles.DRAFT}>
        {getStatusLabel(status, "purchasing")}
        {overdue && status === "UNPAID" ? " (Terlambat)" : ""}
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
        size: 150,
        sortingFn: "datetime",
        cell: ({ row }) => {
          const inv = row.original;
          const overdue = isInvoiceOverdue(inv.dueDate, inv.status);
          return (
            <div
              className={`flex flex-col text-xs ${overdue ? "text-red-600 font-bold" : ""}`}
            >
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                {inv.dueDate ? format(new Date(inv.dueDate), "dd MMM yyyy") : "-"}
                {overdue && <span className="ml-1 rounded bg-red-100 px-1 text-[10px] text-red-700">Terlambat</span>}
              </span>
              {inv.termOfPaymentDays != null && (
                <span className="text-[11px] text-muted-foreground ml-4">
                  {inv.termOfPaymentDays === 0 ? "Cash" : `${inv.termOfPaymentDays} hari`}
                </span>
              )}
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
        size: 130,
        cell: ({ row }) => getStatusBadge(row.original),
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
      <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
        <div className="relative max-w-sm flex-1 sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari invoice, PO, atau supplier..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 w-full"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Semua Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="UNPAID">Belum Dibayar</SelectItem>
            <SelectItem value="PARTIAL">Dibayar Sebagian</SelectItem>
            <SelectItem value="PAID">Lunas</SelectItem>
            <SelectItem value="OVERDUE">Lewat Jatuh Tempo</SelectItem>
            <SelectItem value="CANCELLED">Dibatalkan</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </DataTable>
  );
}
