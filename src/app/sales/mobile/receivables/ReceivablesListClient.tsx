"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search,
  ArrowLeft,
  AlertCircle,
  TrendingDown,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { formatRupiah } from "@/lib/utils/utils";

type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date | string;
  dueDate: Date | string | null;
  totalAmount: number;
  paidAmount: number;
  status: string;
  customerName: string;
  orderNumber: string;
};

interface ReceivablesListClientProps {
  invoices: Invoice[];
}

export function ReceivablesListClient({ invoices }: ReceivablesListClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "OVERDUE" | "UNPAID">("ALL");

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      // 1. Filter by Status Tab
      const isOverdue = inv.status === "OVERDUE" || (inv.dueDate && new Date(inv.dueDate) < new Date());
      if (filter === "OVERDUE" && !isOverdue) return false;
      if (filter === "UNPAID" && isOverdue) return false; // purely unpaid and not overdue yet

      // 2. Filter by search query
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.orderNumber.toLowerCase().includes(q)
      );
    });
  }, [invoices, search, filter]);

  // Sum of outstanding amounts for the filtered list
  const totalOutstanding = useMemo(() => {
    return filtered.reduce((sum, inv) => sum + (inv.totalAmount - inv.paidAmount), 0);
  }, [filtered]);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/sales/mobile")}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Daftar Piutang</h1>
          <p className="text-sm text-muted-foreground">Faktur outstanding & jatuh tempo</p>
        </div>
      </div>

      {/* Summary Widget */}
      <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-rose-800 dark:text-rose-300 uppercase tracking-wider">
            Total Piutang Outstanding
          </p>
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">
            {formatRupiah(totalOutstanding)}
          </p>
        </div>
        <div className="h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center">
          <TrendingDown className="h-5 w-5 text-rose-600 dark:text-rose-400" />
        </div>
      </div>

      {/* Search & Filter Tabs */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari invoice, customer, atau order..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11"
          />
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 gap-2 bg-muted/50 p-1 rounded-xl text-xs font-medium">
          <button
            onClick={() => setFilter("ALL")}
            className={`py-2 rounded-lg text-center transition-all ${
              filter === "ALL"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground"
            }`}
          >
            Semua ({invoices.length})
          </button>
          <button
            onClick={() => setFilter("OVERDUE")}
            className={`py-2 rounded-lg text-center transition-all ${
              filter === "OVERDUE"
                ? "bg-rose-600 text-white shadow-sm font-semibold"
                : "text-muted-foreground"
            }`}
          >
            Overdue ({invoices.filter(i => i.status === "OVERDUE" || (i.dueDate && new Date(i.dueDate) < new Date())).length})
          </button>
          <button
            onClick={() => setFilter("UNPAID")}
            className={`py-2 rounded-lg text-center transition-all ${
              filter === "UNPAID"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground"
            }`}
          >
            Unpaid ({invoices.filter(i => i.status !== "OVERDUE" && !(i.dueDate && new Date(i.dueDate) < new Date())).length})
          </button>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">
            {search ? "Piutang tidak ditemukan" : "Tidak ada piutang outstanding"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inv) => {
            const remaining = inv.totalAmount - inv.paidAmount;
            const isOverdue = inv.status === "OVERDUE" || (inv.dueDate && new Date(inv.dueDate) < new Date());

            return (
              <div
                key={inv.id}
                className="p-4 border rounded-xl bg-card space-y-3 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                      {inv.invoiceNumber}
                    </span>
                    <h3 className="font-bold text-sm text-foreground truncate mt-0.5">
                      {inv.customerName}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Order: <strong className="font-medium text-foreground">{inv.orderNumber}</strong>
                    </p>
                  </div>
                  <Badge
                    variant={isOverdue ? "destructive" : "secondary"}
                    className="text-[9px] uppercase font-bold px-2 py-0.5 shrink-0"
                  >
                    {isOverdue ? "Overdue" : inv.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2.5 border-t text-xs">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Jatuh Tempo</p>
                    <p className={`font-semibold ${isOverdue ? "text-destructive" : "text-foreground"}`}>
                      {inv.dueDate ? format(new Date(inv.dueDate), "dd MMM yyyy") : "-"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Sisa Piutang</p>
                    <p className="font-bold text-sm text-rose-600 dark:text-rose-400">
                      {formatRupiah(remaining)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
