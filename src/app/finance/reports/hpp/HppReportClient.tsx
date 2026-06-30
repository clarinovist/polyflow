"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getHppReportData,
  lockPeriod,
  unlockPeriod,
} from "@/actions/finance/hpp-report";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/utils/utils";
import {
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  format,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Download,
  Lock,
  Unlock,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  ChevronDown,
  ChevronUp as ChevronUpIcon,
} from "lucide-react";
import {
  downloadCsv,
  rupiahForCsv,
  reportFilename,
} from "@/lib/utils/csv-export";
import { toast } from "sonner";
import type { HppReportData, HppProductRow } from "@/lib/utils/hpp-report";

interface PeriodLockInfo {
  lockedAt: string;
  lockedBy: { name: string | null; email: string } | null;
}

export default function HppReportClient() {
  const [data, setData] = useState<HppReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<Date>(new Date());
  const [search, setSearch] = useState("");
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [periodLock, setPeriodLock] = useState<PeriodLockInfo | null>(null);
  const [locking, setLocking] = useState(false);

  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = startOfMonth(date);
      const endDate = endOfMonth(date);

      const result = await getHppReportData(startDate, endDate);
      if (result && "success" in result && result.success) {
        setData(result.data as HppReportData);
      } else {
        console.error(
          "Failed to load HPP report:",
          result && "error" in result ? result.error : "Unknown",
        );
        setData(null);
      }
    } catch (error) {
      console.error("Failed to load HPP report", error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrevMonth = () => setDate((prev) => subMonths(prev, 1));
  const handleNextMonth = () => setDate((prev) => addMonths(prev, 1));
  const handleCurrentMonth = () => setDate(new Date());

  const handleLock = async () => {
    setLocking(true);
    try {
      const result = await lockPeriod(year, month);
      if (result && "success" in result && result.success) {
        toast.success("Periode berhasil dikunci");
        setPeriodLock({ lockedAt: new Date().toISOString(), lockedBy: null });
      } else {
        toast.error(
          result && "error" in result
            ? (result.error as string)
            : "Gagal mengunci periode",
        );
      }
    } catch {
      toast.error("Gagal mengunci periode");
    } finally {
      setLocking(false);
    }
  };

  const handleUnlock = async () => {
    setLocking(true);
    try {
      const result = await unlockPeriod(year, month);
      if (result && "success" in result && result.success) {
        toast.success("Kunci periode berhasil dibuka");
        setPeriodLock(null);
      } else {
        toast.error(
          result && "error" in result
            ? (result.error as string)
            : "Gagal membuka kunci",
        );
      }
    } catch {
      toast.error("Gagal membuka kunci periode");
    } finally {
      setLocking(false);
    }
  };

  const handleDownload = () => {
    if (!data) return;

    const headers = [
      "Produk",
      "SKU",
      "Kategori",
      "Qty Produksi",
      "Jumlah Order",
      "Material/unit",
      "Labor/unit",
      "Machine/unit",
      "HPP/Unit",
      "Standard Cost",
      "Variance",
      "Variance %",
    ];

    const rows: (string | number)[][] = data.products.map((p) => [
      p.productName,
      p.productSku ?? "",
      p.category ?? "",
      p.totalQuantity,
      p.orderCount,
      rupiahForCsv(p.materialPerUnit),
      rupiahForCsv(p.laborPerUnit),
      rupiahForCsv(p.machinePerUnit),
      rupiahForCsv(p.hppPerUnit),
      rupiahForCsv(p.standardCost),
      rupiahForCsv(p.varianceAmount),
      p.variancePercent.toFixed(1) + "%",
    ]);

    // Add order detail section
    rows.push([]);
    rows.push([
      "DETAIL PER PRODUCTION ORDER",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    rows.push([
      "Order#",
      "Produk",
      "SKU",
      "Qty",
      "",
      "Material",
      "Labor",
      "Machine",
      "Total",
      "Unit Cost",
      "",
      "",
    ]);
    for (const o of data.orders) {
      rows.push([
        o.orderNumber,
        o.productName,
        o.productSku ?? "",
        o.quantity,
        "",
        rupiahForCsv(o.materialCost),
        rupiahForCsv(o.laborCost),
        rupiahForCsv(o.machineCost),
        rupiahForCsv(o.totalCost),
        rupiahForCsv(o.unitCost),
        "",
        "",
      ]);
    }

    const dateStr = format(date, "yyyy-MM");
    const filename = reportFilename("Laporan_HPP", dateStr);
    downloadCsv(filename, headers, rows);
  };

  // Filter products by search
  const filteredProducts =
    data?.products.filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.productName.toLowerCase().includes(q) ||
        p.productSku?.toLowerCase().includes(q) ||
        p.bomName.toLowerCase().includes(q)
      );
    }) ?? [];

  // Get orders for a specific BOM
  const getOrdersForBom = (bomId: string) =>
    data?.orders.filter((o) => o.bomId === bomId) ?? [];

  const isLocked = periodLock !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Laporan HPP</h1>
          <p className="text-muted-foreground">
            Harga Pokok Produksi per produk —{" "}
            {format(date, "MMMM yyyy", { locale: idLocale })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Month navigator */}
          <div className="flex items-center border rounded-lg">
            <Button variant="ghost" size="icon" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm font-medium min-w-[140px] text-center">
              {format(date, "MMMM yyyy", { locale: idLocale })}
            </span>
            <Button variant="ghost" size="icon" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={handleCurrentMonth}>
            Bulan Ini
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={fetchData}
            disabled={loading}
          >
            <RotateCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleDownload}
            disabled={!data || data.products.length === 0}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {data && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total COGM</CardDescription>
              <CardTitle className="text-2xl">
                {formatRupiah(data.summary.totalCogm)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {data.summary.orderCount} produksi • {data.summary.productCount}{" "}
                produk
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Material</CardDescription>
              <CardTitle className="text-2xl">
                {data.summary.materialShare.toFixed(1)}%
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                porsi dari total COGM
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Labor</CardDescription>
              <CardTitle className="text-2xl">
                {data.summary.laborShare.toFixed(1)}%
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                porsi dari total COGM
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Machine</CardDescription>
              <CardTitle className="text-2xl">
                {data.summary.machineShare.toFixed(1)}%
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                porsi dari total COGM
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* HPP per Produk */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <CardTitle>HPP per Produk</CardTitle>
              <CardDescription>
                Klik baris produk untuk melihat detail per production order
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari produk..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Material/unit</TableHead>
                  <TableHead className="text-right">Labor/unit</TableHead>
                  <TableHead className="text-right">Machine/unit</TableHead>
                  <TableHead className="text-right">HPP/Unit</TableHead>
                  <TableHead className="text-right">vs Standard</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                      Memuat data...
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-muted-foreground"
                    >
                      {data?.products.length === 0
                        ? "Tidak ada data produksi pada periode ini"
                        : "Tidak ada produk yang cocok dengan pencarian"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => (
                    <ProductRow
                      key={product.bomId}
                      product={product}
                      isExpanded={expandedProduct === product.bomId}
                      onToggle={() =>
                        setExpandedProduct(
                          expandedProduct === product.bomId
                            ? null
                            : product.bomId,
                        )
                      }
                      orders={getOrdersForBom(product.bomId)}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Period Lock */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isLocked ? (
                <>
                  <Lock className="h-4 w-4 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium">Periode Terkunci</p>
                    <p className="text-xs text-muted-foreground">
                      {periodLock.lockedBy?.name ?? "Admin"} •{" "}
                      {new Date(periodLock.lockedAt).toLocaleString("id-ID")}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Unlock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Periode Terbuka</p>
                    <p className="text-xs text-muted-foreground">
                      Data masih bisa berubah jika ada produksi baru
                    </p>
                  </div>
                </>
              )}
            </div>
            <Button
              variant={isLocked ? "outline" : "default"}
              size="sm"
              onClick={isLocked ? handleUnlock : handleLock}
              disabled={locking}
            >
              {locking ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : isLocked ? (
                <Unlock className="h-4 w-4 mr-2" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              {isLocked ? "Buka Kunci" : "Kunci Periode Ini"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Sub-components ----

function VarianceBadge({
  amount,
  percent,
}: {
  amount: number;
  percent: number;
}) {
  if (Math.abs(amount) < 0.01) {
    return (
      <div className="flex items-center gap-1 justify-end">
        <Minus className="h-3 w-3 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">0.0%</span>
      </div>
    );
  }

  const isIncrease = amount > 0;
  return (
    <div className="text-right">
      <div className="flex items-center gap-1 justify-end">
        {isIncrease ? (
          <TrendingUp className="h-3 w-3 text-amber-600" />
        ) : (
          <TrendingDown className="h-3 w-3 text-green-600" />
        )}
        <span
          className={`text-sm font-medium ${isIncrease ? "text-amber-600" : "text-green-600"}`}
        >
          {isIncrease ? "+" : ""}
          {percent.toFixed(1)}%
        </span>
      </div>
      <p
        className={`text-xs ${isIncrease ? "text-amber-500" : "text-green-500"}`}
      >
        {isIncrease ? "+" : ""}
        {formatRupiah(amount)}
      </p>
    </div>
  );
}

function ProductRow({
  product,
  isExpanded,
  onToggle,
  orders,
}: {
  product: HppProductRow;
  isExpanded: boolean;
  onToggle: () => void;
  orders: HppReportData["orders"];
}) {
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onToggle}>
        <TableCell>
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronUpIcon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">{product.productName}</p>
              <p className="text-xs text-muted-foreground">
                {product.bomName}
                {product.productSku && ` • ${product.productSku}`}
                {product.category && (
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    {product.category}
                  </Badge>
                )}
              </p>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-right">
          <p>{product.totalQuantity.toLocaleString("id-ID")}</p>
          <p className="text-xs text-muted-foreground">
            {product.orderCount} order
          </p>
        </TableCell>
        <TableCell className="text-right">
          {formatRupiah(product.materialPerUnit)}
        </TableCell>
        <TableCell className="text-right">
          {formatRupiah(product.laborPerUnit)}
        </TableCell>
        <TableCell className="text-right">
          {formatRupiah(product.machinePerUnit)}
        </TableCell>
        <TableCell className="text-right font-medium">
          {formatRupiah(product.hppPerUnit)}
        </TableCell>
        <TableCell>
          <VarianceBadge
            amount={product.varianceAmount}
            percent={product.variancePercent}
          />
        </TableCell>
      </TableRow>

      {/* Expanded detail rows */}
      {isExpanded &&
        orders.map((order) => (
          <TableRow key={order.orderId} className="bg-muted/30">
            <TableCell className="pl-10">
              <p className="text-sm">{order.orderNumber}</p>
            </TableCell>
            <TableCell className="text-right text-sm">
              {order.quantity.toLocaleString("id-ID")}
            </TableCell>
            <TableCell className="text-right text-sm">
              {formatRupiah(order.materialCost)}
            </TableCell>
            <TableCell className="text-right text-sm">
              {formatRupiah(order.laborCost)}
            </TableCell>
            <TableCell className="text-right text-sm">
              {formatRupiah(order.machineCost)}
            </TableCell>
            <TableCell className="text-right text-sm font-medium">
              {formatRupiah(order.totalCost)}
            </TableCell>
            <TableCell className="text-right text-sm text-muted-foreground">
              {formatRupiah(order.unitCost)}/unit
            </TableCell>
          </TableRow>
        ))}
    </>
  );
}
