import { getPurchasingDashboardStats } from "@/actions/purchasing/purchasing-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/utils/utils";
import {
  ShoppingCart,
  ClipboardList,
  DollarSign,
  Truck,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function PurchasingDashboardPage() {
  const statsRes = await getPurchasingDashboardStats();
  const stats =
    statsRes.success && statsRes.data
      ? statsRes.data
      : {
          openPos: 0,
          pendingPrs: 0,
          monthlySpend: 0,
          topSuppliers: [],
          recentOrders: [],
        };

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Dashboard Pembelian
        </h1>
        <p className="text-muted-foreground">
          Ringkasan aktivitas procurement bulan ini.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">PO Aktif</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.openPos}</div>
            <Link
              href="/purchasing/orders"
              className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
            >
              Lihat semua <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">PR Menunggu</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingPrs}</div>
            <Link
              href="/purchasing/requests"
              className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
            >
              Proses sekarang <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Belanja Bulan Ini
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatRupiah(stats.monthlySpend)}
            </div>
            <p className="text-xs text-muted-foreground">
              Based on confirmed orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Supplier</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className="text-xl font-bold truncate"
              title={stats.topSuppliers[0]?.supplierName || "-"}
            >
              {stats.topSuppliers[0]?.supplierName || "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.topSuppliers[0]
                ? `${stats.topSuppliers[0].orderCount} order(s)`
                : "No orders yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        {/* Recent POs */}
        <Card className="md:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>PO Terbaru</CardTitle>
            <Link
              href="/purchasing/orders"
              className="text-sm text-muted-foreground hover:underline flex items-center gap-1"
            >
              Lihat semua <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Belum ada purchase order.
                </p>
              ) : (
                stats.recentOrders.map((order: any) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/purchasing/orders/${order.id}`}
                          className="font-medium text-sm hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <Badge
                          variant={
                            order.status === "SENT" ? "default" : "outline"
                          }
                          className="text-[10px] h-5"
                        >
                          {order.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {order.supplier?.name || "-"}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="text-sm font-medium">
                        {formatRupiah(order.totalAmount || 0)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {format(new Date(order.createdAt), "MMM dd")}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Suppliers */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Top Supplier Bulan Ini</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.topSuppliers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Belum ada data supplier.
                </p>
              ) : (
                stats.topSuppliers.map((supplier: any) => (
                  <div
                    key={supplier.supplierId}
                    className="flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {supplier.supplierName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {supplier.orderCount} order(s)
                      </p>
                    </div>
                    <div className="text-sm font-medium">
                      {formatRupiah(supplier.totalSpend)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
