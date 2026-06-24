import { getProductVariants } from "@/actions/production/boms";
import { CostingService } from "@/services/accounting/costing-service";
import { formatRupiah } from "@/lib/utils/utils";
import {
  buildCostAuditRows,
  summarizeCostAuditRows,
} from "@/lib/utils/cost-audit";
import {
  formatCostGapLabel,
  getCostAlertShortLabel,
  getCostSourceLabel,
} from "@/lib/utils/cost-diagnostics";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import {
  AlertTriangle,
  FileText,
  Filter,
  Package,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";

import { withTenantPage } from '@/lib/core/tenant';

const getCostingData = withTenantPage(async () => {
    return CostingService.getCostingDashboard();
});
const SOURCE_OPTIONS = [
  "all",
  "inventory_average",
  "standard_cost",
  "explicit_current_cost",
  "buy_price",
  "price",
  "zero",
] as const;
const FLAG_OPTIONS = [
  "all",
  "inventory_standard_gap",
  "low_stock_cost_outlier",
] as const;

type SourceFilter = (typeof SOURCE_OPTIONS)[number];
type FlagFilter = (typeof FLAG_OPTIONS)[number];

function parseSourceFilter(value?: string): SourceFilter {
  return SOURCE_OPTIONS.some((option) => option === value)
    ? (value as SourceFilter)
    : "all";
}

function parseFlagFilter(value?: string): FlagFilter {
  return FLAG_OPTIONS.some((option) => option === value)
    ? (value as FlagFilter)
    : "all";
}

export default async function CostingPage(props: {
  searchParams: Promise<{
    start?: string;
    end?: string;
    anomaly?: string;
    source?: string;
    flag?: string;
  }>;
}) {
  const searchParams = await props.searchParams;

  const startDate = searchParams.start
    ? new Date(searchParams.start)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const endDate = searchParams.end ? new Date(searchParams.end) : new Date();
  const anomalyOnly = searchParams.anomaly === "1";
  const sourceFilter = parseSourceFilter(searchParams.source);
  const flagFilter = parseFlagFilter(searchParams.flag);

  const [costs, variantsRes] = await Promise.all([
    CostingService.getPeriodCosts(startDate, endDate),
    getProductVariants(),
  ]);

  const totalCOGM = costs.reduce((sum, c) => sum + c.totalCost, 0);
  const totalMaterial = costs.reduce((sum, c) => sum + c.materialCost, 0);
  const totalLabor = costs.reduce((sum, c) => sum + c.laborCost, 0);
  const totalMachine = costs.reduce((sum, c) => sum + c.machineCost, 0);

  const variants =
    variantsRes.success && variantsRes.data ? variantsRes.data : [];
  const allAuditRows = buildCostAuditRows(variants);
  const filteredAuditRows = buildCostAuditRows(variants, {
    anomalyOnly,
    source: sourceFilter,
    flag: flagFilter,
  });
  const auditSummary = summarizeCostAuditRows(allAuditRows);

  const buildFilterHref = (
    overrides: Partial<{
      anomaly: string | undefined;
      source: SourceFilter;
      flag: FlagFilter;
    }>,
  ) => {
    const params = new URLSearchParams();

    if (searchParams.start) params.set("start", searchParams.start);
    if (searchParams.end) params.set("end", searchParams.end);

    const nextAnomaly =
      overrides.anomaly !== undefined
        ? overrides.anomaly
        : anomalyOnly
          ? "1"
          : undefined;
    const nextSource =
      overrides.source !== undefined ? overrides.source : sourceFilter;
    const nextFlag = overrides.flag !== undefined ? overrides.flag : flagFilter;

    if (nextAnomaly) params.set("anomaly", nextAnomaly);
    if (nextSource !== "all") params.set("source", nextSource);
    if (nextFlag !== "all") params.set("flag", nextFlag);

    const query = params.toString();
    return query ? `/finance/costing?${query}` : "/finance/costing";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Costing Dashboard
          </h1>
          <p className="text-muted-foreground">
            Production cost analysis using persisted issue cost and actual
            execution data.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link href="/finance/costing/hpp-report">
              <FileText className="mr-2 h-4 w-4" />
              Laporan HPP
            </Link>
          </Button>
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            Filters
          </Button>
          <Button variant="outline">
            <FileText className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total COGM</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatRupiah(totalCOGM)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Cost of Goods Manufactured
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Material Share
            </CardTitle>
            <Package className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatRupiah(totalMaterial)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalCOGM > 0
                ? ((totalMaterial / totalCOGM) * 100).toFixed(1)
                : 0}
              % of total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Labor Share</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatRupiah(totalLabor)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalCOGM > 0 ? ((totalLabor / totalCOGM) * 100).toFixed(1) : 0}%
              of total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Machine Share</CardTitle>
            <Settings className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatRupiah(totalMachine)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalCOGM > 0
                ? ((totalMachine / totalCOGM) * 100).toFixed(1)
                : 0}
              % of total
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-200/70">
        <CardHeader>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Cost Guardrail Audit
              </CardTitle>
              <CardDescription>
                Review variant cost basis, gap vs standard, dan anomaly signal
                untuk cari penyebab selisih antar family/ukuran.
              </CardDescription>
            </div>
            <div className="text-sm text-muted-foreground">
              Showing {filteredAuditRows.length} of {allAuditRows.length}{" "}
              variants
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Variants Scanned
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {auditSummary.totalVariants}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Semua variant dengan cost basis yang bisa diaudit
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Review Needed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">
                  {auditSummary.reviewNeeded}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Variant punya minimal satu anomaly flag
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Low Stock Outlier
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {auditSummary.lowStockOutliers}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Biasanya residue stock tipis / sisa cost lama
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Inventory Avg Basis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {auditSummary.inventoryAverageCount}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {auditSummary.standardFallbackCount} variant masih fallback ke
                  standard cost
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={
                !anomalyOnly && sourceFilter === "all" && flagFilter === "all"
                  ? "default"
                  : "outline"
              }
              asChild
            >
              <Link
                href={buildFilterHref({
                  anomaly: undefined,
                  source: "all",
                  flag: "all",
                })}
              >
                All Variants
              </Link>
            </Button>
            <Button variant={anomalyOnly ? "default" : "outline"} asChild>
              <Link
                href={buildFilterHref({
                  anomaly: anomalyOnly ? undefined : "1",
                  source: "all",
                  flag: "all",
                })}
              >
                Review Needed
              </Link>
            </Button>
            <Button
              variant={
                sourceFilter === "inventory_average" ? "default" : "outline"
              }
              asChild
            >
              <Link
                href={buildFilterHref({
                  source: "inventory_average",
                  anomaly: undefined,
                  flag: "all",
                })}
              >
                Inventory Avg
              </Link>
            </Button>
            <Button
              variant={sourceFilter === "standard_cost" ? "default" : "outline"}
              asChild
            >
              <Link
                href={buildFilterHref({
                  source: "standard_cost",
                  anomaly: undefined,
                  flag: "all",
                })}
              >
                Standard Fallback
              </Link>
            </Button>
            <Button
              variant={
                flagFilter === "low_stock_cost_outlier" ? "default" : "outline"
              }
              asChild
            >
              <Link
                href={buildFilterHref({
                  flag: "low_stock_cost_outlier",
                  anomaly: "1",
                  source: "all",
                })}
              >
                Low Stock Outlier
              </Link>
            </Button>
            <Button
              variant={
                flagFilter === "inventory_standard_gap" ? "default" : "outline"
              }
              asChild
            >
              <Link
                href={buildFilterHref({
                  flag: "inventory_standard_gap",
                  anomaly: "1",
                  source: "all",
                })}
              >
                Std Gap
              </Link>
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product / Variant</TableHead>
                  <TableHead className="text-right">Current Cost</TableHead>
                  <TableHead className="text-right">Standard Cost</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Stock Qty</TableHead>
                  <TableHead className="text-right">Gap</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAuditRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center h-24 text-muted-foreground"
                    >
                      No variants match the current audit filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAuditRows.map((row) => {
                    const gapLabel = formatCostGapLabel(
                      row.currentCost,
                      row.standardCost,
                    );

                    return (
                      <TableRow
                        key={row.variantId}
                        className={
                          row.flags.length > 0
                            ? "bg-amber-50/40 dark:bg-amber-950/10"
                            : ""
                        }
                      >
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">
                              {row.productName}
                            </span>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{row.variantName}</span>
                              <span className="font-mono">{row.skuCode}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatRupiah(row.currentCost)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatRupiah(row.standardCost)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getCostSourceLabel(row.source)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end">
                            <span>{row.stockQty.toLocaleString("id-ID")}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatRupiah(row.stockValue)} value
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {gapLabel ? (
                            <Badge
                              variant={
                                row.flags.length > 0 ? "destructive" : "outline"
                              }
                            >
                              {gapLabel}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              -
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge
                              variant={
                                row.flags.length > 0
