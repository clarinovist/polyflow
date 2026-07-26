import { getSalesOrderStats, getRecentPipelineOrders } from "@/actions/sales/sales";
import { getOutstandingInvoices } from "@/actions/finance/invoice";
import { getCustomers } from "@/actions/sales/customer";
import { Plus, Search, ShoppingCart, Package, ReceiptText, MapPin } from "lucide-react";
import Link from "next/link";
import { RouteTodaySection } from "@/components/field/RouteTodaySection";
import { PipelineSummaryCard } from "@/components/field/PipelineSummaryCard";
import { VisitSyncBanner } from "@/components/sales/mobile/VisitSyncBanner";
import { formatRupiah } from "@/lib/utils/utils";

export default async function FieldSalesDashboardPage() {
  const [statsRes, invoicesRes, customersRes, recentPipelineRes] = await Promise.all([
    getSalesOrderStats(),
    getOutstandingInvoices(),
    getCustomers(),
    getRecentPipelineOrders(),
  ]);
  const stats = statsRes?.success && statsRes.data ? statsRes.data : null;
  const invoices = invoicesRes?.success && invoicesRes.data ? invoicesRes.data : [];
  const customers = customersRes?.success && customersRes.data ? customersRes.data : [];
  const recentPipeline = recentPipelineRes?.success && recentPipelineRes.data ? recentPipelineRes.data : [];

  const totalOutstanding = invoices.reduce(
    (sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.paidAmount)),
    0
  );

  const activeCustomers = customers
    .filter((c) => c.isActive)
    .map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      city: c.city,
    }));

  const now = new Date();
  const greeting =
    now.getHours() < 12
      ? "Selamat pagi"
      : now.getHours() < 17
      ? "Selamat siang"
      : "Selamat sore";
  const dateStr = now.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="p-4 space-y-4">
      {/* Header — Today-first greeting */}
      <div>
        <h1 className="text-xl font-bold">
          {greeting} 👋
        </h1>
        <p className="text-sm text-muted-foreground">{dateStr}</p>
      </div>

      {/* Sync Banner */}
      <VisitSyncBanner />

      {/* Rute Hari Ini — Above fold priority */}
      <RouteTodaySection activeCustomers={activeCustomers} />

      {/* Pipeline Saya — Stacked hybrid counts + next 3 */}
      <PipelineSummaryCard
        activeCount={stats?.activeCount ?? 0}
        pipelineAmount={stats?.pipelineAmount ?? 0}
        openQuotationCount={stats?.openQuotationCount ?? 0}
        openQuotationAmount={stats?.openQuotationAmount ?? 0}
        followUpCount={0}
        topItems={recentPipeline}
      />

      {/* Quick Actions — Aksi cepat */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/field/sales/orders/create"
          className="flex items-center gap-3 p-4 bg-primary text-primary-foreground rounded-xl active:scale-95 transition-transform min-h-[48px]"
        >
          <Plus className="h-6 w-6" />
          <div>
            <p className="font-semibold">Order Baru</p>
            <p className="text-xs opacity-80">Buat pesanan cepat</p>
          </div>
        </Link>
        <Link
          href="/field/sales/customers"
          className="flex items-center gap-3 p-4 bg-muted rounded-xl active:scale-95 transition-transform min-h-[48px]"
        >
          <Search className="h-6 w-6 text-muted-foreground" />
          <div>
            <p className="font-semibold">Cari Customer</p>
            <p className="text-xs text-muted-foreground">Lihat daftar outlet</p>
          </div>
        </Link>
      </div>

      {/* Summary — Field KPI, no batal/total */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/field/sales/receivables"
          className="flex items-center gap-3 p-3 border rounded-xl text-sm active:scale-[0.98] transition-transform min-h-[48px]"
        >
          <ReceiptText className="h-5 w-5 text-rose-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Piutang Outstanding</p>
            <p className="font-bold text-sm text-rose-600 dark:text-rose-400 truncate">
              {formatRupiah(totalOutstanding)}
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-3 p-3 border rounded-xl min-h-[48px]">
          <ShoppingCart className="h-5 w-5 text-blue-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Order Aktif</p>
            <p className="font-bold text-sm">{stats?.activeCount ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Links — Quick access */}
      <div className="space-y-2">
        <Link
          href="/field/sales/orders"
          className="flex items-center gap-3 p-3 border rounded-xl text-sm font-medium active:scale-[0.98] transition-transform min-h-[48px]"
        >
          <ReceiptText className="h-4 w-4 text-muted-foreground" />
          Lihat Semua Order
        </Link>
        <Link
          href="/field/sales/visits"
          className="flex items-center gap-3 p-3 border rounded-xl text-sm font-medium active:scale-[0.98] transition-transform min-h-[48px]"
        >
          <MapPin className="h-4 w-4 text-muted-foreground" />
          Riwayat Kunjungan
        </Link>
        <Link
          href="/field/sales/stock"
          className="flex items-center gap-3 p-3 border rounded-xl text-sm font-medium active:scale-[0.98] transition-transform min-h-[48px]"
        >
          <Package className="h-4 w-4 text-muted-foreground" />
          Cek Stok Produk
        </Link>
      </div>
    </div>
  );
}
