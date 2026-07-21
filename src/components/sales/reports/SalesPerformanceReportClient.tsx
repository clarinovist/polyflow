"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/utils/utils";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { BarChart3, Users, Package, TrendingUp } from "lucide-react";

type Summary = {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  avgOrderValue: number;
  topCustomers: { name: string; revenue: number; orders: number }[];
  topProducts: { name: string; revenue: number; quantity: number }[];
};

type Row = {
  period: string;
  orderId: string;
  orderNumber: string;
  orderDate: Date | string;
  customerName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  totalAmount: number;
  status: string;
  invoiceStatus: string | null;
  salesPerson: string;
};

type Initial = { rows: Row[]; summary: Summary } | null;

export function SalesPerformanceReportClient({ initialData, periodLabel }: { initialData: Initial; periodLabel: string; start: Date; end: Date }) {
  const summary = initialData?.summary ?? null;
  const rows = initialData?.rows ?? [];
  const [activeTab, setActiveTab] = useState<"summary" | "customers" | "products" | "detail">("summary");

  const tabs = [
    { key: "summary" as const, label: "Ringkasan", icon: TrendingUp },
    { key: "customers" as const, label: "Top Customer", icon: Users },
    { key: "products" as const, label: "Top Produk", icon: Package },
    { key: "detail" as const, label: "Detail Order", icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      {summary == null ? (
        <div className="text-center py-12 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>Tidak ada data untuk periode {periodLabel}.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Scope: {periodLabel} • orderDate non-batal</p>
          <div className="flex gap-2 border-b pb-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors ${
                    activeTab === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Summary Tab */}
          {activeTab === "summary" && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Omzet</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatRupiah(summary.totalRevenue)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Order</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.totalOrders}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Customer</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.totalCustomers}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Rata-rata per Order</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatRupiah(summary.avgOrderValue)}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Top Customers Tab */}
          {activeTab === "customers" && (
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Customer by Omzet</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">#</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-center">Order</TableHead>
                      <TableHead className="text-right">Omzet</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.topCustomers.map((c, i) => (
                      <TableRow key={c.name}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-center">{c.orders}</TableCell>
                        <TableCell className="text-right font-semibold">{formatRupiah(c.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Top Products Tab */}
          {activeTab === "products" && (
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Produk by Omzet</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">#</TableHead>
                      <TableHead>Produk</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Omzet</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.topProducts.map((p, i) => (
                      <TableRow key={p.name}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-center">{p.quantity}</TableCell>
                        <TableCell className="text-right font-semibold">{formatRupiah(p.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Detail Tab */}
          {activeTab === "detail" && (
            <Card>
              <CardHeader>
                <CardTitle>Detail Order ({rows.length} baris)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[600px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>SO</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Produk</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead>Sales</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, i) => (
                        <TableRow key={`${row.orderId}-${i}`}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {format(new Date(row.orderDate), "dd MMM", { locale: idLocale })}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.orderNumber}</TableCell>
                          <TableCell className="text-sm">{row.customerName}</TableCell>
                          <TableCell className="text-sm">{row.productName}</TableCell>
                          <TableCell className="text-right text-sm">{row.quantity}</TableCell>
                          <TableCell className="text-right text-sm font-semibold">{formatRupiah(row.subtotal)}</TableCell>
                          <TableCell className="text-xs">{row.salesPerson}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{row.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
