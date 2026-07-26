import { getMyFieldPipelineStats, getMyFieldReceivables, getMyFieldCustomers, getMyFieldComplianceStats } from "@/actions/sales/field-actions";
import { getTodayRoutePlan } from "@/actions/sales/route-plans";
import { Plus, Search, ShoppingCart, Package, ReceiptText, MapPin, Navigation, Store } from "lucide-react";
import Link from "next/link";
import { RouteTodaySection } from "@/components/field/RouteTodaySection";
import { PipelineSummaryCard } from "@/components/field/PipelineSummaryCard";
import { VisitSyncBanner } from "@/components/sales/mobile/VisitSyncBanner";
import { formatRupiah } from "@/lib/utils/utils";

export default async function FieldSalesDashboardPage() {
  const [pipelineRes, invoicesRes, customersRes, routeRes, complianceRes] = await Promise.all([
    getMyFieldPipelineStats(),
    getMyFieldReceivables(),
    getMyFieldCustomers(),
    getTodayRoutePlan(),
    getMyFieldComplianceStats(),
  ]);

  const pipeline = pipelineRes?.success && pipelineRes.data ? pipelineRes.data : null;
  const invoices = invoicesRes?.success && invoicesRes.data ? invoicesRes.data : [];
  const customers = customersRes?.success && customersRes.data ? customersRes.data : [];
  const rawRoutePlan = routeRes?.success && routeRes.data ? routeRes.data : null;
  // Normalize Date -> string for RouteTodaySection (expects string date)
  const routePlan = rawRoutePlan
    ? {
        ...rawRoutePlan,
        date: rawRoutePlan.date instanceof Date ? rawRoutePlan.date.toISOString().split("T")[0] : String(rawRoutePlan.date),
      }
    : null;
  const compliance = complianceRes?.success && complianceRes.data ? complianceRes.data : null;

  const totalOutstanding = invoices.reduce(
    (sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.paidAmount)),
    0
  );

  const overdueCount = invoices.filter(
    (inv) => inv.status === "OVERDUE"
  ).length;

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
          {greeting}
        </h1>
        <p className="text-sm text-muted-foreground">{dateStr}</p>
      </div>

      {/* Sync Banner */}
      <VisitSyncBanner />

      {/* Rute Hari Ini — Above fold priority */}
      <RouteTodaySection routePlan={routePlan} activeCustomers={activeCustomers} />

      {/* Compliance KPI */}
      {compliance && compliance.assigned > 0 && (
        <div className="border rounded-xl p-3 bg-card">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Compliance Hari Ini</span>
            <span className="text-xs font-bold">{compliance.completed}/{compliance.assigned} toko</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full transition-all"
              style={{ width: `${compliance.compliance}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">{compliance.compliance}% selesai</span>
            {compliance.extraCalls > 0 && (
              <span className="text-[10px] text-orange-600 font-semibold">+{compliance.extraCalls} EC</span>
            )}
          </div>
        </div>
      )}

      {/* Pipeline Saya — Stacked hybrid counts + next 3 */}
      <PipelineSummaryCard
        activeCount={pipeline?.activeCount ?? 0}
        pipelineAmount={pipeline?.pipelineAmount ?? 0}
        openQuotationCount={pipeline?.openQuotationCount ?? 0}
        openQuotationAmount={pipeline?.openQuotationAmount ?? 0}
        followUpCount={0}
        topItems={pipeline?.recentPipeline ?? []}
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

      {/* Mulai Kunjungan — prominent CTA */}
      <Link
        href="/field/sales/customers?startVisit=true"
        className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-xl active:scale-[0.98] transition-transform min-h-[52px]"
      >
        <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
          <Navigation className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm text-emerald-800 dark:text-emerald-300">Mulai Kunjungan</p>
          <p className="text-xs text-emerald-600/80 dark:text-emerald-400/70">Check-in di toko atau buat toko baru</p>
        </div>
        <Store className="h-5 w-5 text-emerald-400 shrink-0" />
      </Link>

      {/* Summary — Field KPI */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/field/sales/receivables"
          className="flex items-center gap-3 p-3 border rounded-xl text-sm active:scale-[0.98] transition-transform min-h-[48px]"
        >
          <ReceiptText className="h-5 w-5 text-rose-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">
              Piutang{overdueCount > 0 ? ` (${overdueCount} overdue)` : ""}
            </p>
            <p className="font-bold text-sm text-rose-600 dark:text-rose-400 truncate">
              {formatRupiah(totalOutstanding)}
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-3 p-3 border rounded-xl min-h-[48px]">
          <ShoppingCart className="h-5 w-5 text-blue-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Order Aktif</p>
            <p className="font-bold text-sm">{pipeline?.activeCount ?? 0}</p>
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
