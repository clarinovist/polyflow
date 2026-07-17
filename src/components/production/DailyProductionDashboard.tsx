"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Plus,
  Factory,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
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

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "outline" | "destructive";
    icon: React.ElementType;
  }
> = {
  RELEASED: { label: "Siap Produksi", variant: "outline", icon: Clock },
  IN_PROGRESS: { label: "Sedang Jalan", variant: "default", icon: Factory },
  WAITING_MATERIAL: {
    label: "Tunggu Bahan",
    variant: "destructive",
    icon: AlertCircle,
  },
  COMPLETED: { label: "Selesai", variant: "secondary", icon: CheckCircle2 },
  DRAFT: { label: "Draft", variant: "secondary", icon: Clock },
};

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
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4 items-start overflow-x-auto">
          {columns.map((col) => (
            <section
              key={col.key}
              className="rounded-xl border bg-card/60 min-h-[320px] flex flex-col"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-card/90 backdrop-blur-sm px-3 py-2.5 rounded-t-xl">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn("h-2 w-2 rounded-full shrink-0", col.accent)}
                  />
                  <h2 className="text-xs font-bold tracking-wide truncate">
                    {col.label}
                  </h2>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground border rounded-full px-2 py-0.5">
                  {col.orders.length}
                </span>
              </div>
              <div className="p-2.5 flex flex-col gap-2.5 flex-1">
                {col.orders.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center border border-dashed rounded-lg px-3 py-8 text-center text-xs text-muted-foreground">
                    Tidak ada order di proses ini
                  </div>
                ) : (
                  col.orders.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))
                )}
              </div>
            </section>
          ))}
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

function OrderCard({ order }: { order: Order }) {
  const progress =
    order.plannedQuantity > 0
      ? Math.min(
          ((Number(order.actualQuantity) || 0) /
            Number(order.plannedQuantity)) *
            100,
          100,
        )
      : 0;

  const totalOutput = (order.executions ?? []).reduce(
    (sum, ex) => sum + Number(ex.quantityProduced),
    0,
  );
  const totalScrap = (order.executions ?? []).reduce(
    (sum, ex) => sum + Number(ex.scrapQuantity),
    0,
  );

  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.DRAFT;
  const StatusIcon = statusConfig.icon;

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-semibold truncate">
              {order.bom.productVariant.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {order.bom.name}
            </p>
          </div>
          <Badge variant={statusConfig.variant} className="ml-1 shrink-0 gap-1">
            <StatusIcon className="h-3 w-3" />
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {order.machine && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Mesin:</span>
            <span className="font-medium">{order.machine.code}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Output</span>
            <span className="font-medium">
              {Number(order.actualQuantity || 0).toLocaleString("id-ID")} /{" "}
              {Number(order.plannedQuantity).toLocaleString("id-ID")}{" "}
              {order.bom.productVariant.primaryUnit || ""}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {(order.executions ?? []).length > 0 && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{(order.executions ?? []).length} eksekusi</span>
            <span>Output: {totalOutput.toLocaleString("id-ID")}</span>
            {totalScrap > 0 && (
              <span className="text-red-500">
                Scrap: {totalScrap.toLocaleString("id-ID")}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Link href={`/production/orders/${order.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              Detail
            </Button>
          </Link>
          <Link href="/kiosk" className="flex-1">
            <Button variant="secondary" size="sm" className="w-full gap-1.5">
              <Factory className="h-3.5 w-3.5" />
              Kiosk
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
