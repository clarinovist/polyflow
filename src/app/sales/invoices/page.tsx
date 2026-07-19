"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { getSalesInvoices, getInvoiceStats } from "@/actions/finance/invoices";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { InvoiceTable } from "@/components/sales/InvoiceTable";
import { formatRupiah, serializeData } from "@/lib/utils/utils";
import { salesLabels } from "@/lib/labels";
import { BadgeDollarSign, AlertCircle, CheckCircle, Clock, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type FilterStatus = "all" | "UNPAID" | "PARTIAL" | "OVERDUE" | "PAID";

export default function SalesInvoicesPage() {
  const { data: session } = useSession();
  const userRole = session?.user?.role;
  const canAccessFinance = userRole === "ADMIN" || userRole === "FINANCE";
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([]);
  const [stats, setStats] = useState<{
    totalOutstanding: number;
    overdueCount: number;
    partialCount: number;
    paidCount: number;
    unpaidCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    Promise.all([
      getSalesInvoices({ startDate: start, endDate: end }),
      getInvoiceStats(),
    ]).then(([invoicesRes, statsRes]) => {
      const invData = invoicesRes && typeof invoicesRes === "object" && "data" in invoicesRes
        ? (invoicesRes as { data: Record<string, unknown>[] }).data
        : [];
      const statsData = statsRes && typeof statsRes === "object" && "data" in statsRes
        ? (statsRes as { data: typeof stats }).data
        : null;
      setInvoices(invData ?? []);
      setStats(statsData ?? null);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  const filteredInvoices = useMemo(() => {
    if (filter === "all") return invoices;
    return invoices.filter((inv) => inv.status === filter);
  }, [invoices, filter]);

  const serializedInvoices = useMemo(() => serializeData(filteredInvoices), [filteredInvoices]);

  const filterButtons: { label: string; value: FilterStatus; count: number; icon: typeof FileText }[] = [
    { label: "Semua", value: "all", count: invoices.length, icon: FileText },
    { label: "Belum Bayar", value: "UNPAID", count: stats?.unpaidCount ?? 0, icon: Clock },
    { label: "Partial", value: "PARTIAL", count: stats?.partialCount ?? 0, icon: Clock },
    { label: "Jatuh Tempo", value: "OVERDUE", count: stats?.overdueCount ?? 0, icon: AlertCircle },
    { label: "Lunas", value: "PAID", count: stats?.paidCount ?? 0, icon: CheckCircle },
  ];

  return (
    <div className="flex flex-col space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{salesLabels.salesInvoices}</h1>
          <p className="text-muted-foreground">{salesLabels.salesInvoicesDesc}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Outstanding
                </CardTitle>
                <BadgeDollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatRupiah(stats?.totalOutstanding ?? 0)}</div>
                <p className="text-xs text-muted-foreground">
                  Total piutang belum lunas
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Jatuh Tempo
                </CardTitle>
                <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats?.overdueCount ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  Perlu segera ditagih
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Partial
                </CardTitle>
                <Clock className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">{stats?.partialCount ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  Bayar sebagian
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Lunas
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats?.paidCount ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  Invoice terbayar
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filter Chips + Aging Link */}
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {filterButtons.map((fb) => {
                const Icon = fb.icon;
                return (
                  <Button
                    key={fb.value}
                    variant={filter === fb.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter(fb.value)}
                    className="h-7 text-xs"
                  >
                    <Icon className="h-3 w-3 mr-1" />
                    {fb.label}
                    <span className="ml-1 text-muted-foreground">({fb.count})</span>
                  </Button>
                );
              })}
            </div>
            {canAccessFinance && (
              <Link href="/finance/aging" className="text-xs text-blue-600 hover:underline">
                Lihat Aging Piutang →
              </Link>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Daftar Invoice</CardTitle>
              <CardDescription>
                {filter === "all" ? "Semua invoice" : `Invoice status: ${filter}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <InvoiceTable invoices={serializedInvoices as any[]} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
