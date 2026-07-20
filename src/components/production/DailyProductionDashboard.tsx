"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Plus,
  Factory,
  ExternalLink,
  MonitorPlay,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { QuickProduceDialog } from "./QuickProduceDialog";
import { cn } from "@/lib/utils/utils";

export type Order = {
  id: string;
  orderNumber: string;
  status: string;
  plannedQuantity: number;
  actualQuantity: number | null;
  plannedStartDate: string;
  notes: string | null;
  bom: {
    id: string;
    name: string;
    category: string;
    productVariant: {
      id: string;
      name: string;
      primaryUnit: string | null;
    };
  };
  machine: {
    id: string;
    name: string;
    code: string;
  } | null;
  executions: Array<{
    id: string;
    quantityProduced: number;
    scrapQuantity: number;
    startTime: string;
    endTime: string | null;
    status: string;
  }>;
  plannedMaterials: Array<{
    id: string;
    productVariantId: string;
    quantity: number;
  }>;
};

export type Bom = {
  id: string;
  name: string;
  category: string;
  productVariant: {
    id: string;
    name: string;
    product: {
      name: string;
    };
  };
};

export type Machine = {
  id: string;
  name: string;
  code: string;
  type: string;
  status: string;
};

/** Soft status pills — no heavy solid badges competing with product title */
const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    /** Tailwind classes for pill surface */
    className: string;
    /** Dot color */
    dotClassName: string;
    pulse?: boolean;
  }
> = {
  RELEASED: {
    label: "Siap Produksi",
    className:
      "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25",
    dotClassName: "bg-sky-500",
  },
  IN_PROGRESS: {
    label: "Sedang Jalan",
    className:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    dotClassName: "bg-emerald-500",
    pulse: true,
  },
  WAITING_MATERIAL: {
    label: "Tunggu Bahan",
    className:
      "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30",
    dotClassName: "bg-amber-500",
  },
  COMPLETED: {
    label: "Selesai",
    className:
      "bg-muted text-muted-foreground border-border",
    dotClassName: "bg-muted-foreground",
  },
  DRAFT: {
    label: "Draft",
    className:
      "bg-muted/80 text-muted-foreground border-border",
    dotClassName: "bg-muted-foreground/70",
  },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        cfg.className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {cfg.pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
              cfg.dotClassName,
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full",
            cfg.dotClassName,
          )}
        />
      </span>
      {cfg.label}
    </span>
  );
}

/** Process columns left→right. Unknown categories fall into OTHER. */
const PROCESS_COLUMNS: Array<{
  key: string;
  label: string;
  categories: string[];
  accent: string;
}> = [
  {
    key: "MIXING",
    label: "MIXING",
    categories: ["MIXING"],
    accent: "bg-violet-500",
  },
  {
    key: "EXTRUSION",
    label: "EXTRUSION",
    categories: ["EXTRUSION"],
    accent: "bg-emerald-500",
  },
  {
    key: "PACKING",
    label: "PACKING",
    categories: ["PACKING"],
    accent: "bg-blue-500",
  },
  {
    key: "OTHER",
    label: "REWORK / LAINNYA",
    categories: ["REWORK", "STANDARD"],
    accent: "bg-muted-foreground",
  },
];

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "Semua status" },
  { key: "IN_PROGRESS", label: "Sedang Jalan" },
  { key: "RELEASED", label: "Siap Produksi" },
  { key: "WAITING_MATERIAL", label: "Tunggu Bahan" },
];

function columnKeyForCategory(category: string): string {
  const upper = (category || "").toUpperCase();
  for (const col of PROCESS_COLUMNS) {
    if (col.categories.includes(upper)) return col.key;
  }
  return "OTHER";
}

export function DailyProductionDashboard({
  orders,
  boms,
  machines,
}: {
  orders: Order[];
  boms: Bom[];
  machines: Machine[];
  /** @deprecated unused — process board replaces status KPI cards */
  stats?: { total: number; running: number; released: number; waiting: number };
  userId?: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredOrders = useMemo(() => {
    if (statusFilter === "all") return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const columns = useMemo(() => {
    const buckets: Record<string, Order[]> = {};
    for (const col of PROCESS_COLUMNS) buckets[col.key] = [];
    for (const order of filteredOrders) {
      buckets[columnKeyForCategory(order.bom.category)].push(order);
    }
    return PROCESS_COLUMNS.map((col) => ({
      ...col,
      orders: buckets[col.key] ?? [],
    }));
  }, [filteredOrders]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.key}
              type="button"
              size="sm"
              variant={statusFilter === f.key ? "default" : "outline"}
              className={cn(
                "rounded-full h-8",
                statusFilter === f.key ? "" : "text-muted-foreground",
              )}
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Produk
        </Button>
      </div>

      {orders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Factory className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">
              Belum ada produksi aktif
            </h3>
            <p className="text-sm text-muted-foreground/70 mt-1 mb-4">
              Klik &quot;Tambah Produk&quot; untuk memulai produksi.
            </p>
            <Button
              onClick={() => setDialogOpen(true)}
              variant="outline"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Tambah Produk Pertama
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4 items-start">
          {columns.map((col) => {
            const runningCount = col.orders.filter(
              (o) => o.status === "IN_PROGRESS",
            ).length;
            return (
              <section
                key={col.key}
                className="rounded-xl border bg-card/60 min-h-[320px] flex flex-col overflow-hidden"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-card/95 backdrop-blur-sm px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn("h-2 w-2 rounded-full shrink-0", col.accent)}
                    />
                    <h2 className="text-xs font-bold tracking-wide truncate">
                      {col.label}
                    </h2>
                    {runningCount > 0 && (
                      <span className="hidden sm:inline text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        · {runningCount} jalan
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground border rounded-full px-2 py-0.5 tabular-nums">
                    {col.orders.length}
                  </span>
                </div>
                <div className="p-2.5 flex flex-col gap-2.5 flex-1">
                  {col.orders.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center border border-dashed rounded-lg px-3 py-10 text-center text-xs text-muted-foreground/80">
                      Tidak ada order di proses ini
                    </div>
                  ) : (
                    col.orders.map((order) => (
                      <OrderCard key={order.id} order={order} columnAccent={col.accent} />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <QuickProduceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        boms={boms}
        machines={machines}
      />
    </div>
  );
}

function OrderCard({
  order,
  columnAccent,
}: {
  order: Order;
  columnAccent: string;
}) {
  const actual = Number(order.actualQuantity || 0);
  const planned = Number(order.plannedQuantity || 0);
  const progress =
    planned > 0 ? Math.min((actual / planned) * 100, 100) : 0;

  const totalScrap = (order.executions ?? []).reduce(
    (sum, ex) => sum + Number(ex.scrapQuantity),
    0,
  );
  const execCount = (order.executions ?? []).length;
  const unit = order.bom.productVariant.primaryUnit || "";
  const isRunning = order.status === "IN_PROGRESS";
  const isWaiting = order.status === "WAITING_MATERIAL";

  return (
    <Card
      className={cn(
        "relative overflow-hidden shadow-sm hover:shadow-md transition-shadow border-border/80",
        isRunning && "ring-1 ring-emerald-500/20",
        isWaiting && "ring-1 ring-amber-500/20",
      )}
    >
      {/* Left status / process accent */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1",
          isRunning
            ? "bg-emerald-500"
            : isWaiting
              ? "bg-amber-500"
              : columnAccent,
        )}
        aria-hidden
      />

      <CardContent className="p-3 pl-3.5 space-y-3">
        {/* Row: status + WO number */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <StatusPill status={order.status} />
          <span
            className="text-[10px] font-mono text-muted-foreground truncate max-w-[45%] text-right"
            title={order.orderNumber}
          >
            {order.orderNumber}
          </span>
        </div>

        {/* Product identity — full width, no badge collision */}
        <div className="min-w-0 space-y-0.5">
          <h3
            className="text-sm font-semibold leading-snug line-clamp-2 text-foreground"
            title={order.bom.productVariant.name}
          >
            {order.bom.productVariant.name}
          </h3>
          <p
            className="text-[11px] text-muted-foreground line-clamp-1"
            title={order.bom.name}
          >
            {order.bom.name}
          </p>
        </div>

        {/* Machine chip */}
        {order.machine ? (
          <div className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs max-w-full">
            <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-semibold tabular-nums truncate">
              {order.machine.code}
            </span>
            {order.machine.name &&
              order.machine.name !== order.machine.code && (
                <span className="text-muted-foreground truncate hidden sm:inline">
                  · {order.machine.name}
                </span>
              )}
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-[11px] text-muted-foreground">
            <Wrench className="h-3 w-3 shrink-0" />
            Belum ada mesin
          </div>
        )}

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Output</span>
            <span className="font-medium tabular-nums text-right">
              <span className="text-foreground">
                {actual.toLocaleString("id-ID")}
              </span>
              <span className="text-muted-foreground">
                {" "}
                / {planned.toLocaleString("id-ID")} {unit}
              </span>
              <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">
                ({Math.round(progress)}%)
              </span>
            </span>
          </div>
          <Progress
            value={progress}
            className="h-1.5"
            indicatorClassName={cn(
              isRunning && "bg-emerald-500",
              isWaiting && "bg-amber-500",
            )}
          />
          {(execCount > 0 || totalScrap > 0) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
              {execCount > 0 && (
                <span className="tabular-nums">{execCount} batch</span>
              )}
              {totalScrap > 0 && (
                <span className="text-red-500 tabular-nums">
                  Scrap {totalScrap.toLocaleString("id-ID")}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-0.5">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 gap-1.5 text-xs"
            asChild
          >
            <Link href={`/production/orders/${order.id}`}>
              <ExternalLink className="h-3.5 w-3.5" />
              Detail
            </Link>
          </Button>
          <Button
            variant={isRunning ? "default" : "secondary"}
            size="sm"
            className="flex-1 h-8 gap-1.5 text-xs"
            asChild
          >
            <Link href="/kiosk">
              <MonitorPlay className="h-3.5 w-3.5" />
              Kiosk
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
