import { getSalesOrderStats } from "@/actions/sales/sales";
import { ShoppingCart, CheckCircle, XCircle, Plus, Search } from "lucide-react";
import Link from "next/link";

export default async function SalesMobileDashboardPage() {
  const statsRes = await getSalesOrderStats();
  const stats = statsRes?.success && statsRes.data ? statsRes.data : null;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Sales Mobile</h1>
        <p className="text-sm text-muted-foreground">Ringkasan hari ini</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/sales/mobile/orders/create"
          className="flex items-center gap-3 p-4 bg-primary text-primary-foreground rounded-xl active:scale-95 transition-transform"
        >
          <Plus className="h-6 w-6" />
          <div>
            <p className="font-semibold">Order Baru</p>
            <p className="text-xs opacity-80">Buat pesanan cepat</p>
          </div>
        </Link>
        <Link
          href="/sales/mobile/customers"
          className="flex items-center gap-3 p-4 bg-muted rounded-xl active:scale-95 transition-transform"
        >
          <Search className="h-6 w-6 text-muted-foreground" />
          <div>
            <p className="font-semibold">Cari Customer</p>
            <p className="text-xs text-muted-foreground">Lihat daftar outlet</p>
          </div>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 border rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">Order Aktif</span>
          </div>
          <p className="text-2xl font-bold">{stats?.activeCount ?? 0}</p>
        </div>
        <div className="p-4 border rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-muted-foreground">Selesai</span>
          </div>
          <p className="text-2xl font-bold">{stats?.completedCount ?? 0}</p>
        </div>
        <div className="p-4 border rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-xs text-muted-foreground">Dibatalkan</span>
          </div>
          <p className="text-2xl font-bold">{stats?.cancelledCount ?? 0}</p>
        </div>
        <div className="p-4 border rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total Order</span>
          </div>
          <p className="text-2xl font-bold">{stats?.totalOrders ?? 0}</p>
        </div>
      </div>

      {/* Links */}
      <div className="space-y-2">
        <Link
          href="/sales/mobile/stock"
          className="block p-3 border rounded-xl text-sm font-medium active:scale-[0.98] transition-transform"
        >
          📦 Cek Stok Produk
        </Link>
        <Link
          href="/sales/mobile/orders"
          className="block p-3 border rounded-xl text-sm font-medium active:scale-[0.98] transition-transform"
        >
          📋 Lihat Semua Order
        </Link>
      </div>
    </div>
  );
}
