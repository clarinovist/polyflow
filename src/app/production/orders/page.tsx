import { Button } from "@/components/ui/button";
import { planningLabels } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Search,
  ChevronRight,
  Activity,
  Clock,
  AlertCircle,
  Layers,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  getProductionOrders,
  getProductionOrderStats,
} from "@/actions/production/production";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BomCategory } from "@prisma/client";
import { getEnteredQuantityDisplay } from "@/lib/utils/production-units";
import { ProductionStatusBadge } from "@/components/production/production-status-badge";
import { ProductionPriorityBadge } from "@/components/production/production-priority-badge";
import { getStatusLabel } from "@/lib/labels/helpers";
import { cn } from "@/lib/utils/utils";
import { ContextualHelp } from "@/components/support/contextual-help";

const ALL_STATUSES = [
  "DRAFT",
  "WAITING_MATERIAL",
  "RELEASED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

const ALL_CATEGORIES = [
  { value: "all", label: "Semua" },
  { value: "mixing", label: "Mixing" },
  { value: "extrusion", label: "Extrusion" },
  { value: "packing", label: "Packing" },
  { value: "rework", label: "Rework" },
] as const;

export default async function ProductionOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    status?: string;
    q?: string;
    late?: string;
  }>;
}) {
  const { category, status, q, late } = await searchParams;

  let bomCategories: BomCategory[] | undefined;

  if (category === "mixing") {
    bomCategories = ["MIXING"];
  } else if (category === "extrusion") {
    // Extrusion tab includes STANDARD BOMs that are extruded downstream
    bomCategories = ["EXTRUSION", "STANDARD"] as BomCategory[];
  } else if (category === "packing") {
    bomCategories = ["PACKING"];
  } else if (category === "rework") {
    bomCategories = ["REWORK"];
  }

  const validStatuses = [
    "DRAFT",
    "RELEASED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
    "WAITING_MATERIAL",
  ] as const;
  const statusFilter =
    status && (validStatuses as readonly string[]).includes(status)
      ? (status as (typeof validStatuses)[number])
      : undefined;

  const isLateFilter = late === "1";
  const searchQuery = typeof q === "string" ? q.trim() : "";

  const orders = await getProductionOrders({
    bomCategories,
    status: statusFilter,
    q: searchQuery || undefined,
    late: isLateFilter || undefined,
  });
  const stats = await getProductionOrderStats();

  const buildHref = (overrides: {
    category?: string | null;
    status?: string | null;
    q?: string | null;
    late?: string | null;
  }) => {
    const params = new URLSearchParams();
    // Category
    const nextCat =
      overrides.category !== undefined ? overrides.category : category;
    if (nextCat && nextCat !== "all") params.set("category", nextCat);
    // Status
    const nextStatus =
      overrides.status !== undefined ? overrides.status : status;
    if (nextStatus) params.set("status", nextStatus);
    // Search
    const nextQ = overrides.q !== undefined ? overrides.q : q;
    if (nextQ) params.set("q", nextQ);
    // Late
    const nextLate = overrides.late !== undefined ? overrides.late : late;
    if (nextLate) params.set("late", nextLate);

    const qs = params.toString();
    return qs ? `/production/orders?${qs}` : "/production/orders";
  };

  const hasActiveFilters = !!(statusFilter || isLateFilter || searchQuery || (category && category !== "all"));

  const activeCat = category || "all";

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Daftar SPK
          </h1>
          <p className="text-muted-foreground mt-2">
            {planningLabels.listSpkDesc}
            {(statusFilter || isLateFilter) && (
              <span className="ml-1 font-medium text-foreground">
                {isLateFilter
                  ? `• ${planningLabels.lateOverdue}`
                  : `• ${getStatusLabel(statusFilter!, "production")}`}
              </span>
            )}
          </p>
          {hasActiveFilters && (
            <Link
              href={buildHref({
                category: null,
                status: null,
                q: null,
                late: null,
              })}
              className="inline-flex mt-2 text-xs font-semibold text-primary hover:underline"
            >
              Hapus semua filter
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <ContextualHelp
            title="Panduan SPK"
            prefillQuestion="Cara buat SPK batch harian di Polyflow?"
            links={[
              { title: 'Cara Buat SPK Batch Harian', slug: 'cara-spk-batch-harian' },
              { title: 'Cara Input Hasil via Kiosk', slug: 'cara-input-hasil-kiosk' },
              { title: 'Error Backflush / Stok Bahan', slug: 'error-backflush-atau-stok-bahan' },
            ]}
          />
          <Link href="/production/orders/create" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto gap-2">
              <Plus className="h-4 w-4" />
              {planningLabels.createWorkOrder}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards - clickable */}
      <div className="grid gap-4 md:grid-cols-4">
        <Link
          href={buildHref({ status: null, late: null })}
          className={cn(
            "rounded-lg",
            !statusFilter && !isLateFilter && "ring-2 ring-primary"
          )}
        >
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {planningLabels.totalOrders}
              </CardTitle>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalOrders}</div>
            </CardContent>
          </Card>
        </Link>
        <Link
          href={buildHref({ status: "IN_PROGRESS", late: null })}
          className={cn(
            "rounded-lg",
            statusFilter === "IN_PROGRESS" && !isLateFilter && "ring-2 ring-primary"
          )}
        >
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {planningLabels.inProgress}
              </CardTitle>
              <Activity className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeCount}</div>
            </CardContent>
          </Card>
        </Link>
        <Card className="h-full" title="Terdiri dari Draft, Siap Produksi, dan Menunggu Bahan">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {planningLabels.readyToRelease}
            </CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.draftCount}</div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Draft + Siap + Tunggu Bahan
            </p>
          </CardContent>
        </Card>
        <Link
          href={buildHref({ status: null, late: "1" })}
          className={cn(
            "rounded-lg",
            isLateFilter && "ring-2 ring-red-500"
          )}
        >
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {planningLabels.lateOverdue}
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {stats.lateCount}
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        {/* Category tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={activeCat} className="w-auto">
            <TabsList className="w-auto inline-flex h-auto p-1 flex-wrap">
              {ALL_CATEGORIES.map((c) => (
                <TabsTrigger
                  key={c.value}
                  value={c.value}
                  asChild
                  className="text-xs sm:text-sm"
                >
                  <Link href={buildHref({ category: c.value })}>{c.label}</Link>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Status chips */}
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={buildHref({ status: null, late: null })}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:bg-accent",
              !statusFilter && !isLateFilter
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background"
            )}
          >
            Semua status
          </Link>
          {ALL_STATUSES.map((s) => (
            <Link
              key={s}
              href={buildHref({ status: s, late: null })}
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:bg-accent",
                statusFilter === s && !isLateFilter
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background"
              )}
            >
              {getStatusLabel(s, "production")}
            </Link>
          ))}
          <Link
            href={buildHref({ status: null, late: "1" })}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:bg-accent",
              isLateFilter
                ? "bg-red-600 text-white border-red-600"
                : "bg-background border-red-200 text-red-600"
            )}
          >
            Terlambat
          </Link>
        </div>

        {/* Search form GET */}
        <form
          action="/production/orders"
          method="GET"
          className="flex gap-2 w-full"
        >
          {category && category !== "all" && (
            <input type="hidden" name="category" value={category} />
          )}
          {statusFilter && (
            <input type="hidden" name="status" value={statusFilter} />
          )}
          {isLateFilter && <input type="hidden" name="late" value="1" />}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={searchQuery}
              placeholder={planningLabels.searchSpkPlaceholder}
              className="pl-9 w-full"
              aria-label="Cari SPK"
            />
            {searchQuery && (
              <Link
                href={buildHref({ q: null })}
                className="absolute right-2 top-2 h-6 w-6 inline-flex items-center justify-center rounded-full hover:bg-muted"
                aria-label="Hapus pencarian"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            )}
          </div>
          <Button type="submit" variant="secondary" size="sm" className="shrink-0">
            Cari
          </Button>
        </form>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {planningLabels.allOrders}
                {searchQuery && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    untuk &quot;{searchQuery}&quot;
                  </span>
                )}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {orders.length} SPK
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto custom-scrollbar">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{planningLabels.orderNumber}</TableHead>
                    <TableHead>{planningLabels.product}</TableHead>
                    <TableHead>{planningLabels.status}</TableHead>
                    <TableHead>{planningLabels.demandSource}</TableHead>
                    <TableHead>{planningLabels.machine}</TableHead>
                    <TableHead>{planningLabels.progress}</TableHead>
                    <TableHead>{planningLabels.planned}</TableHead>
                    <TableHead>{planningLabels.startDate}</TableHead>
                    <TableHead className="text-right">
                      {planningLabels.actions}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-center h-32 text-muted-foreground"
                      >
                        <div className="flex flex-col items-center gap-3 py-2">
                          <p>{planningLabels.noSpkFound}</p>
                          <div className="flex gap-2">
                            {hasActiveFilters && (
                              <Link
                                href="/production/orders"
                                className="inline-flex"
                              >
                                <Button variant="outline" size="sm">
                                  {planningLabels.clearFilters}
                                </Button>
                              </Link>
                            )}
                            <Link href="/production/orders/create">
                              <Button size="sm" className="gap-1">
                                <Plus className="h-3.5 w-3.5" />
                                {planningLabels.createWorkOrder}
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((order) => {
                      const progress =
                        (Number(order.actualQuantity || 0) /
                          Number(order.plannedQuantity || 1)) *
                        100;

                      return (
                        <TableRow
                          key={order.id}
                          className="hover:bg-muted/50 group"
                        >
                          <TableCell className="font-medium">
                            <Link
                              href={`/production/orders/${order.id}`}
                              className="hover:underline text-foreground block py-1"
                            >
                              {order.orderNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/production/orders/${order.id}`}
                              className="block"
                            >
                              <div className="flex items-center gap-2">
                                <div className="font-medium text-foreground">
                                  {order.bom.productVariant.name}
                                </div>
                                <ProductionPriorityBadge
                                  priority={order.priority}
                                />
                                {order.isMaklon && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] py-0 h-4 border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                                  >
                                    Maklon
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {order.bom.name}
                              </div>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/production/orders/${order.id}`}
                              className="block"
                            >
                              <ProductionStatusBadge status={order.status} />
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/production/orders/${order.id}`}
                              className="block"
                            >
                              <div className="flex flex-col gap-1">
                                {order.salesOrder ? (
                                  <>
                                    <span className="text-sm font-medium">
                                      {order.salesOrder.customer?.name ||
                                        order.salesOrder.orderNumber}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {order.salesOrder.orderNumber} •{" "}
                                      {order.salesOrder.orderType.replace(
                                        /_/g,
                                        " ",
                                      )}
                                    </span>
                                  </>
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs font-normal w-fit"
                                  >
                                    {planningLabels.internalStockBuildLabel}
                                  </Badge>
                                )}
                              </div>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/production/orders/${order.id}`}
                              className="block"
                            >
                              {order.machine ? (
                                <Badge
                                  variant="secondary"
                                  className="font-normal text-xs"
                                >
                                  {order.machine.code}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </Link>
                          </TableCell>
                          <TableCell className="w-[150px]">
                            <Link
                              href={`/production/orders/${order.id}`}
                              className="block"
                            >
                              <div className="flex items-center gap-2">
                                <Progress
                                  value={Math.min(progress, 100)}
                                  className="h-2 w-16"
                                />
                                <span className="text-xs text-muted-foreground">
                                  {Math.round(progress)}%
                                </span>
                              </div>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/production/orders/${order.id}`}
                              className="block"
                            >
                              {getEnteredQuantityDisplay({
                                ...order.bom.productVariant,
                                quantity: order.plannedQuantity,
                                enteredQuantity:
                                  order.plannedEnteredQuantity,
                                enteredUnit: order.plannedEnteredUnit,
                                conversionFactorSnapshot:
                                  order.plannedConversionFactorSnapshot,
                              })}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <Link
                              href={`/production/orders/${order.id}`}
                              className="block"
                            >
                              {format(
                                new Date(order.plannedStartDate),
                                "d MMM yyyy",
                                { locale: idLocale }
                              )}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right">
                            <Link href={`/production/orders/${order.id}`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                              >
                                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
