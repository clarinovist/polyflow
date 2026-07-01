"use client";

import { useMemo, useCallback, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/utils/utils";
import { format } from "date-fns";
import { CheckCircle2, CreditCard, Trash2, Loader2, Search } from "lucide-react";
import { deletePayment } from "@/actions/finance/finance";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
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

interface Payment {
  id: string;
  referenceNumber: string;
  date: Date | string;
  entityName: string;
  amount: number;
  method: string;
  status: string;
}

interface ComponentProps {
  title: string;
  description: string;
  payments: Payment[];
  type: "received" | "sent";
}

export function SharedPaymentTable({
  title,
  description,
  payments,
  type,
}: ComponentProps) {
  const isReceived = type === "received";
  const amountColor = isReceived ? "text-emerald-600" : "text-red-600";
  const amountPrefix = isReceived ? "+" : "-";
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const lowerSearch = searchTerm.toLowerCase();
      return (
        p.referenceNumber.toLowerCase().includes(lowerSearch) ||
        p.entityName.toLowerCase().includes(lowerSearch) ||
        p.method.toLowerCase().includes(lowerSearch)
      );
    });
  }, [payments, searchTerm]);

  const handleDelete = useCallback(
    async (id: string) => {
      setIsDeleting(id);
      try {
        const result = await deletePayment(id);
        if (result.success) {
          toast.success("Pembayaran berhasil dihapus dan jurnal dibersihkan.");
          router.refresh();
        } else {
          toast.error(result.error || "Gagal menghapus pembayaran");
        }
      } catch (_error) {
        toast.error('Gagal memproses. Silakan coba lagi.');
      } finally {
        setIsDeleting(null);
      }
    },
    [router],
  );

  const columns: ColumnDef<Payment, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "referenceNumber",
        header: "Reference",
        size: 150,
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.referenceNumber}
          </span>
        ),
      },
      {
        accessorKey: "date",
        header: "Date",
        size: 120,
        sortingFn: "datetime",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {format(new Date(row.original.date), "dd MMM yyyy")}
          </span>
        ),
      },
      {
        accessorKey: "entityName",
        header: isReceived ? "Received From" : "Paid To",
        size: 180,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.entityName}</span>
        ),
      },
      {
        accessorKey: "method",
        header: "Method",
        size: 120,
      },
      {
        accessorKey: "amount",
        header: () => <div className="text-right">Amount</div>,
        size: 150,
        cell: ({ row }) => (
          <div className={`text-right font-bold ${amountColor}`}>
            {amountPrefix} {formatRupiah(row.original.amount)}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: () => <div className="text-right">Status</div>,
        size: 120,
        cell: ({ row }) => (
          <div className="text-right">
            <Badge
              variant="outline"
              className="bg-emerald-50 text-emerald-700 border-emerald-200"
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {row.original.status || "Lunas"}
            </Badge>
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        size: 50,
        enableSorting: false,
        cell: ({ row }) => {
          const payment = row.original;
          return (
            <div className="text-right whitespace-nowrap">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-red-600"
                    disabled={isDeleting === payment.id}
                  >
                    {isDeleting === payment.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Hapus Catatan Pembayaran?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Ini akan menghapus pembayaran beserta entri jurnal General
                      Ledger terkait. Status invoice akan dihitung ulang.
                      Tindakan ini tidak dapat dibatalkan.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDelete(payment.id)}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Hapus
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          );
        },
      },
    ],
    [isReceived, amountColor, amountPrefix, isDeleting, handleDelete],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={filteredPayments}
          emptyMessage="Tidak ada catatan pembayaran."
          minWidth={800}
        >
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={
                isReceived
                  ? "Cari referensi atau pelanggan..."
                  : "Cari referensi atau supplier..."
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </DataTable>
      </CardContent>
    </Card>
  );
}
