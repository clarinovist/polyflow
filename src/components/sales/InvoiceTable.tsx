"use client";

import { useState, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/utils/utils";
import { format } from "date-fns";
import {
  ArrowRight,
  Trash2,
  Loader2,
  Receipt,
  ChevronRight,
  Search,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { salesLabels, formLabels, getStatusLabel } from "@/lib/labels";
import { InvoiceStatus } from "@prisma/client";
import { deleteInvoice } from "@/actions/finance/invoices";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // 1. Filter by status
      if (statusFilter !== "ALL" && inv.status !== statusFilter) {
        return false;
      }

      // 2. Filter by search term
      const lowerSearch = searchTerm.toLowerCase();
      const entityName = (
        inv.salesOrder?.customer?.name ||
        inv.purchaseOrder?.supplier?.name ||
        "Legacy Internal Stock Build"
      ).toLowerCase();
      const invoiceNum = inv.invoiceNumber.toLowerCase();
      const orderRef = (
        inv.salesOrder?.orderNumber ||
        inv.purchaseOrder?.orderNumber ||
        ""
      ).toLowerCase();

      return (
        invoiceNum.includes(lowerSearch) ||
        entityName.includes(lowerSearch) ||
        orderRef.includes(lowerSearch)
      );
    });
  }, [invoices, searchTerm, statusFilter]);

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
      toast.error("Gagal memproses invoice. Silakan coba lagi.");
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

  const getStatusBadgeStyle = (status: InvoiceStatus) => {
    const styles: Record<string, string> = {
      UNPAID: "bg-slate-100 text-slate-800",
      PAID: "bg-emerald-100 text-emerald-800",
      PARTIAL: "bg-amber-100 text-amber-800",
      OVERDUE: "bg-red-100 text-red-800 border-red-200",
      CANCELLED: "bg-red-50 text-red-500",
    };
    return styles[status] || styles.UNPAID;
  };

  const getEntityName = (invoice: InvoiceData) =>
    invoice.salesOrder?.customer?.name ||
    invoice.purchaseOrder?.supplier?.name ||
    "Legacy Internal Stock Build";

  const renderMobileView = (data: InvoiceData[]) => (
    <>
      {data.length === 0 ? (
        <div className="text-center p-4 text-muted-foreground border rounded-lg border-dashed">
          {salesLabels.emptyInvoices}
        </div>
      ) : (
        data.map((invoice) => {
          const linkId = basePath.includes("finance")
            ? invoice.id
            : invoice.salesOrderId || invoice.purchaseOrderId || invoice.id;
          return (
            <Card
              key={invoice.id}
              className="overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
              onClick={() => router.push(`${basePath}/${linkId}`)}
            >
              <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className="bg-primary/10 p-1.5 rounded-full">
                      <Receipt className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">
                        {invoice.invoiceNumber}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(invoice.invoiceDate), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1.5 h-5 ${getStatusBadgeStyle(invoice.status)}`}
                  >
                    {getStatusLabel(invoice.status, "finance")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                        Entitas
                      </p>
                      <p className="font-medium truncate">
                        {getEntityName(invoice)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                        {formLabels.total}
                      </p>
                      <p className="font-semibold text-primary">
                        {formatRupiah(Number(invoice.totalAmount))}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Jatuh tempo:{" "}
                      {invoice.dueDate
                        ? format(new Date(invoice.dueDate), "MMM d, yyyy")
                        : "-"}
                    </span>
                    <div className="flex items-center text-primary font-medium">
                      Lihat Detail <ChevronRight className="h-3 w-3 ml-0.5" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </>
  );

  return (
    <DataTable
      columns={columns}
      data={filteredInvoices}
      emptyMessage={salesLabels.emptyInvoices}
      minWidth={900}
      renderMobileView={renderMobileView}
    >
      <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
        <div className="relative max-w-sm flex-1 sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari invoice, order, atau entitas..."
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
